using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using FoodBridge.Application.Common;
using FoodBridge.Application.Common.Interfaces;
using FoodBridge.Application.DTOs;
using FoodBridge.Application.Services.Interfaces;
using FoodBridge.Domain.Entities;
using FoodBridge.Domain.Enums;

namespace FoodBridge.Application.Services.Implementations;

public class AdminService : IAdminService
{
    private readonly IApplicationDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly UserManager<ApplicationUser>? _userManager;

    public AdminService(
        IApplicationDbContext context,
        INotificationService notificationService) : this(context, notificationService, null)
    {
    }

    public AdminService(
        IApplicationDbContext context,
        INotificationService notificationService,
        UserManager<ApplicationUser>? userManager)
    {
        _context = context;
        _notificationService = notificationService;
        _userManager = userManager;
    }

    public async Task<AdminDashboardStatsDto> GetDashboardStatsAsync()
    {
        var totalUsers = await _context.Users.CountAsync();
        var totalProviders = await _context.Users.CountAsync(u => u.UserType == UserType.FoodProvider);
        var totalCharities = await _context.Users.CountAsync(u => u.UserType == UserType.Charity);
        var pendingVerifications = await _context.Users.CountAsync(u => !u.IsVerified && u.Status == UserStatus.Active && u.UserType != UserType.Administrator);

        var activeDonations = await _context.FoodListings.CountAsync(l => l.Status == FoodListingStatus.Available || l.Status == FoodListingStatus.Reserved);
        var completedDonations = await _context.FoodListings.CountAsync(l => l.Status == FoodListingStatus.Completed);
        var outstandingRequests = await _context.Reservations.CountAsync(r => r.Status == ReservationStatus.Pending);

        var totalRedistributed = await _context.FoodListings
            .Where(l => l.Status == FoodListingStatus.Completed)
            .SumAsync(l => (decimal?)l.Quantity) ?? 0m;

        var reportedListings = await _context.FoodListings.CountAsync(l => l.IsReported);
        var reportedReviews = await _context.Reviews.CountAsync(r => r.IsReported);
        var reportedProblems = await _context.Reservations.CountAsync(r => r.Status == ReservationStatus.ProblemReported);

        var expiredDonationsCount = await _context.FoodListings.CountAsync(l => l.Status == FoodListingStatus.Expired);
        var totalWastedQuantity = await _context.FoodListings
            .Where(l => l.Status == FoodListingStatus.Expired)
            .SumAsync(l => (decimal?)l.Quantity) ?? 0m;

        return new AdminDashboardStatsDto
        {
            TotalUsers = totalUsers,
            TotalProviders = totalProviders,
            TotalCharities = totalCharities,
            PendingVerifications = pendingVerifications,
            ActiveDonations = activeDonations,
            CompletedDonations = completedDonations,
            OutstandingRequests = outstandingRequests,
            TotalRedistributedQuantity = totalRedistributed,
            ReportedListingsCount = reportedListings,
            ReportedReviewsCount = reportedReviews,
            ReportedProblemsCount = reportedProblems,
            ExpiredDonationsCount = expiredDonationsCount,
            TotalWastedQuantity = totalWastedQuantity
        };
    }

    public async Task<List<AdminUserListItemDto>> GetUsersAsync(AdminUserFilterDto filter)
    {
        var query = _context.Users
            .Include(u => u.FoodListings)
            .Include(u => u.Reservations)
            .AsNoTracking()
            .AsQueryable();

        if (filter.UserType.HasValue)
        {
            query = query.Where(u => u.UserType == filter.UserType.Value);
        }

        if (filter.IsVerified.HasValue)
        {
            query = query.Where(u => u.IsVerified == filter.IsVerified.Value);
        }

        if (filter.Status.HasValue)
        {
            query = query.Where(u => u.Status == filter.Status.Value);
        }

        if (filter.LockedOnly == true)
        {
            query = query.Where(u => u.AccessFailedCount > 0 || u.LockoutEnd != null);
        }

        if (!string.IsNullOrWhiteSpace(filter.SearchTerm))
        {
            var term = filter.SearchTerm.Trim();
            query = query.Where(u => (u.FullName != null && u.FullName.Contains(term))
                || (u.Email != null && u.Email.Contains(term))
                || (u.OrganizationName != null && u.OrganizationName.Contains(term))
                || (u.SpecificType != null && u.SpecificType.Contains(term)));
        }

        var users = await query.OrderByDescending(u => u.CreatedAt).ToListAsync();

        return users.Select(u => new AdminUserListItemDto
        {
            Id = u.Id,
            FullName = u.FullName,
            Email = u.Email ?? string.Empty,
            OrganizationName = u.OrganizationName,
            OrganizationAddress = u.OrganizationAddress,
            UserType = u.UserType,
            SpecificType = u.SpecificType,
            TargetCommunityDescription = u.TargetCommunityDescription,
            IsVerified = u.IsVerified,
            Status = u.Status,
            CreatedAt = u.CreatedAt,
            ActiveItemsCount = u.UserType == UserType.FoodProvider 
                ? u.FoodListings.Count(l => l.Status == FoodListingStatus.Available || l.Status == FoodListingStatus.Reserved)
                : u.Reservations.Count(r => r.Status == ReservationStatus.Accepted || r.Status == ReservationStatus.ReadyForPickup),
            CompletedItemsCount = u.UserType == UserType.FoodProvider
                ? u.FoodListings.Count(l => l.Status == FoodListingStatus.Completed)
                : u.Reservations.Count(r => r.Status == ReservationStatus.Completed),
            AccessFailedCount = u.AccessFailedCount,
            LockoutEnd = u.LockoutEnd,
            IsLockedOut = (u.LockoutEnd.HasValue && u.LockoutEnd.Value > DateTimeOffset.UtcNow) || u.AccessFailedCount >= 10
        }).ToList();
    }

    public async Task<Result> VerifyOrganizationAsync(string adminId, string targetUserId, bool isApproved)
    {
        var user = await _context.Users.FindAsync(targetUserId);
        if (user == null)
        {
            return Result.Failure("User not found.");
        }

        user.IsVerified = isApproved;
        if (!isApproved)
        {
            user.Status = UserStatus.Suspended;
        }
        else
        {
            user.Status = UserStatus.Active;
        }

        var audit = new AuditLog
        {
            AdminId = adminId,
            Action = isApproved ? "ApproveVerification" : "RejectVerification",
            TargetEntity = "ApplicationUser",
            TargetId = targetUserId,
            Details = $"Organization '{user.OrganizationName}' verification {(isApproved ? "approved" : "rejected and suspended")}.",
            Timestamp = DateTimeOffset.UtcNow
        };
        _context.AuditLogs.Add(audit);

        await _context.SaveChangesAsync();

        await _notificationService.SendNotificationAsync(
            targetUserId,
            isApproved ? "Organization Verified!" : "Verification Update",
            isApproved 
                ? "Your organization verification has been approved by the platform administrator. You have full access to donation features!"
                : "Your organization verification request was not approved. Please contact platform support for guidance.",
            $"user:{targetUserId}");

        return Result.Success();
    }

    public async Task<Result> SetUserStatusAsync(string adminId, string targetUserId, bool suspend, string? reason = null)
    {
        if (targetUserId == adminId && suspend)
        {
            return Result.Failure("Security rule: An administrator cannot suspend their own account.");
        }

        var user = await _context.Users.FindAsync(targetUserId);
        if (user == null)
        {
            return Result.Failure("User not found.");
        }

        user.Status = suspend ? UserStatus.Suspended : UserStatus.Active;
        if (!suspend && _userManager != null)
        {
            await _userManager.ResetAccessFailedCountAsync(user);
            await _userManager.SetLockoutEndDateAsync(user, null);
        }

        var cleanReason = !string.IsNullOrWhiteSpace(reason) ? reason.Trim() : null;

        var audit = new AuditLog
        {
            AdminId = adminId,
            Action = suspend ? "SuspendUser" : "ReactivateUser",
            TargetEntity = "ApplicationUser",
            TargetId = targetUserId,
            Details = suspend && cleanReason != null
                ? $"User '{user.FullName}' ({user.OrganizationName}) was suspended. Reason: {cleanReason}"
                : $"User '{user.FullName}' ({user.OrganizationName}) was {(suspend ? "suspended" : "reactivated")}.",
            Timestamp = DateTimeOffset.UtcNow
        };
        _context.AuditLogs.Add(audit);

        await _context.SaveChangesAsync();

        var notifMessage = suspend
            ? (cleanReason != null 
                ? $"Your FoodBridge account has been suspended. Reason: {cleanReason}"
                : "Your FoodBridge account has been suspended due to platform policy review.")
            : "Your FoodBridge account has been reactivated. You may now continue using the platform.";

        await _notificationService.SendNotificationAsync(
            targetUserId,
            suspend ? "Account Suspended" : "Account Reactivated",
            notifMessage,
            $"user:{targetUserId}");

        return Result.Success();
    }

    public async Task<List<FoodListingDto>> GetReportedListingsAsync()
    {
        var listings = await _context.FoodListings
            .Include(l => l.Provider)
            .Where(l => l.IsReported)
            .OrderByDescending(l => l.CreatedAt)
            .AsNoTracking()
            .ToListAsync();

        return listings.Select(l => new FoodListingDto
        {
            Id = l.Id,
            ProviderId = l.ProviderId,
            ProviderName = l.Provider?.FullName ?? "Unknown",
            ProviderOrganization = l.Provider?.OrganizationName ?? "Unknown",
            ProviderType = l.Provider?.SpecificType ?? "Provider",
            FoodName = l.FoodName,
            Description = l.Description,
            FoodCategory = l.FoodCategory,
            Quantity = l.Quantity,
            UnitOfMeasurement = l.UnitOfMeasurement,
            PreparationDate = l.PreparationDate,
            PickupDeadline = l.PickupDeadline,
            PickupAddress = l.PickupAddress,
            StorageConditions = l.StorageConditions,
            Allergens = l.Allergens,
            ImageUrl = l.ImageUrl,
            Status = l.Status,
            IsReported = l.IsReported,
            ReportReason = l.ReportReason,
            CreatedAt = l.CreatedAt
        }).ToList();
    }

    public async Task<List<ReviewDto>> GetReportedReviewsAsync()
    {
        var reviews = await _context.Reviews
            .Include(r => r.Reviewer)
            .Include(r => r.Reviewee)
            .Where(r => r.IsReported)
            .OrderByDescending(r => r.CreatedAt)
            .AsNoTracking()
            .ToListAsync();

        return reviews.Select(r => new ReviewDto
        {
            Id = r.Id,
            ReservationId = r.ReservationId,
            ReviewerId = r.ReviewerId,
            ReviewerName = r.Reviewer?.FullName ?? "Unknown",
            ReviewerOrganization = r.Reviewer?.OrganizationName ?? "Unknown",
            ReviewerRole = r.Reviewer?.UserType.ToString() ?? "User",
            RevieweeId = r.RevieweeId,
            RevieweeName = r.Reviewee?.FullName ?? "Unknown",
            RevieweeOrganization = r.Reviewee?.OrganizationName ?? "Unknown",
            Rating = r.Rating,
            Comment = r.Comment,
            IsReported = r.IsReported,
            ReportReason = r.ReportReason,
            CreatedAt = r.CreatedAt
        }).ToList();
    }

    public async Task<List<ReservationDto>> GetProblemReportsAsync()
    {
        var list = await _context.Reservations
            .Include(r => r.FoodListing)
            .ThenInclude(l => l!.Provider)
            .Include(r => r.Charity)
            .Where(r => r.Status == ReservationStatus.ProblemReported)
            .OrderByDescending(r => r.RequestDate)
            .AsNoTracking()
            .ToListAsync();

        return list.Select(r => new ReservationDto
        {
            Id = r.Id,
            FoodListingId = r.FoodListingId,
            FoodName = r.FoodListing?.FoodName ?? "Unknown",
            Quantity = r.FoodListing?.Quantity ?? 0,
            UnitOfMeasurement = r.FoodListing?.UnitOfMeasurement ?? string.Empty,
            FoodCategory = r.FoodListing?.FoodCategory.ToString() ?? "Other",
            ListingImageUrl = r.FoodListing?.ImageUrl,
            PickupDeadline = r.FoodListing?.PickupDeadline ?? DateTime.MinValue,

            CharityId = r.CharityId,
            CharityName = r.Charity?.FullName ?? "Unknown",
            CharityOrganization = r.Charity?.OrganizationName ?? "Unknown",
            CharityEmail = r.Charity?.Email ?? string.Empty,
            CharityPhone = r.Charity?.PhoneNumber ?? string.Empty,

            ProviderId = r.FoodListing?.ProviderId ?? string.Empty,
            ProviderName = r.FoodListing?.Provider?.FullName ?? "Unknown",
            ProviderOrganization = r.FoodListing?.Provider?.OrganizationName ?? "Unknown",
            ProviderEmail = r.FoodListing?.Provider?.Email ?? string.Empty,

            RequestDate = r.RequestDate,
            PickupDateTime = r.PickupDateTime,
            ConfirmedLocation = r.ConfirmedLocation,
            Status = r.Status,
            ProblemDescription = r.ProblemDescription,
            CompletedAt = r.CompletedAt
        }).ToList();
    }

    public async Task<Result> RemoveListingAsync(string adminId, int listingId, string reason)
    {
        var listing = await _context.FoodListings.FindAsync(listingId);
        if (listing == null)
        {
            return Result.Failure("Listing not found.");
        }

        listing.Status = FoodListingStatus.Cancelled;
        listing.IsReported = false;
        listing.ReportReason = $"Removed by Admin: {reason}";
        listing.UpdatedAt = DateTimeOffset.UtcNow;

        var audit = new AuditLog
        {
            AdminId = adminId,
            Action = "RemoveListing",
            TargetEntity = "FoodListing",
            TargetId = listingId.ToString(),
            Details = $"Listing '{listing.FoodName}' removed. Reason: {reason}",
            Timestamp = DateTimeOffset.UtcNow
        };
        _context.AuditLogs.Add(audit);

        await _context.SaveChangesAsync();

        await _notificationService.SendNotificationAsync(
            listing.ProviderId,
            "Listing Removed by Administrator",
            $"Your food listing '{listing.FoodName}' was removed by an administrator. Reason: {reason}",
            $"listing:{listingId}");

        return Result.Success();
    }

    public async Task<Result> RemoveReviewAsync(string adminId, int reviewId, string reason)
    {
        var review = await _context.Reviews.FindAsync(reviewId);
        if (review == null)
        {
            return Result.Failure("Review not found.");
        }

        var audit = new AuditLog
        {
            AdminId = adminId,
            Action = "RemoveReview",
            TargetEntity = "Review",
            TargetId = reviewId.ToString(),
            Details = $"Review ID {reviewId} removed. Reason: {reason}",
            Timestamp = DateTimeOffset.UtcNow
        };
        _context.AuditLogs.Add(audit);

        _context.Reviews.Remove(review);
        await _context.SaveChangesAsync();

        return Result.Success();
    }

    public async Task<Result> ResolveProblemReportAsync(string adminId, int reservationId, string notes)
    {
        var res = await _context.Reservations
            .Include(r => r.FoodListing)
            .FirstOrDefaultAsync(r => r.Id == reservationId);

        if (res == null)
        {
            return Result.Failure("Reservation not found.");
        }

        res.Status = ReservationStatus.Cancelled;
        res.CancellationReason = $"Resolved by Admin: {notes}";

        var audit = new AuditLog
        {
            AdminId = adminId,
            Action = "ResolveProblemReport",
            TargetEntity = "Reservation",
            TargetId = reservationId.ToString(),
            Details = $"Problem report on Reservation {reservationId} resolved. Notes: {notes}",
            Timestamp = DateTimeOffset.UtcNow
        };
        _context.AuditLogs.Add(audit);

        await _context.SaveChangesAsync();

        await _notificationService.SendNotificationAsync(
            res.CharityId,
            "Problem Report Resolved",
            $"Administrator investigated and resolved your reported issue: {notes}",
            $"reservation:{reservationId}");

        return Result.Success();
    }

    public async Task<List<FoodListingDto>> GetExpiredListingsAsync()
    {
        var listings = await _context.FoodListings
            .Include(l => l.Provider)
            .Where(l => l.Status == FoodListingStatus.Expired)
            .OrderByDescending(l => l.PickupDeadline)
            .AsNoTracking()
            .ToListAsync();

        return listings.Select(l => new FoodListingDto
        {
            Id = l.Id,
            ProviderId = l.ProviderId,
            ProviderName = l.Provider?.FullName ?? "Unknown",
            ProviderOrganization = l.Provider?.OrganizationName ?? "Unknown",
            ProviderType = l.Provider?.SpecificType ?? "Provider",
            FoodName = l.FoodName,
            Description = l.Description,
            FoodCategory = l.FoodCategory,
            Quantity = l.Quantity,
            UnitOfMeasurement = l.UnitOfMeasurement,
            PreparationDate = l.PreparationDate,
            PickupDeadline = l.PickupDeadline,
            PickupAddress = l.PickupAddress,
            StorageConditions = l.StorageConditions,
            Allergens = l.Allergens,
            ImageUrl = l.ImageUrl,
            Status = l.Status,
            IsReported = l.IsReported,
            ReportReason = l.ReportReason,
            CreatedAt = l.CreatedAt
        }).ToList();
    }

    public async Task<Result> HandleExpiredListingActionAsync(string adminId, int listingId, ExpiredListingActionDto dto)
    {
        var listing = await _context.FoodListings
            .Include(l => l.Provider)
            .FirstOrDefaultAsync(l => l.Id == listingId);

        if (listing == null)
        {
            return Result.Failure("Listing not found.");
        }

        if (dto.ActionType == "SuspendProvider")
        {
            if (listing.Provider != null)
            {
                listing.Provider.Status = UserStatus.Suspended;
            }
            var audit = new AuditLog
            {
                AdminId = adminId,
                Action = "SuspendProviderWasteViolation",
                TargetEntity = "ApplicationUser",
                TargetId = listing.ProviderId,
                Details = $"Provider suspended due to waste/expiry violation on listing '{listing.FoodName}' (ID: {listingId}). Notes: {dto.Notes}",
                Timestamp = DateTimeOffset.UtcNow
            };
            _context.AuditLogs.Add(audit);

            await _notificationService.SendNotificationAsync(
                listing.ProviderId,
                "Account Suspended - Food Waste Policy",
                $"Your provider account was suspended following administrative review of expired listing '{listing.FoodName}'. Reason: {dto.Notes}",
                $"listing:{listingId}");
        }
        else if (dto.ActionType == "RecordDisposal")
        {
            listing.ReportReason = $"Disposal Logged: {dto.Notes}";
            var audit = new AuditLog
            {
                AdminId = adminId,
                Action = "RecordWasteDisposal",
                TargetEntity = "FoodListing",
                TargetId = listingId.ToString(),
                Details = $"Safe disposal audit logged for expired surplus '{listing.FoodName}' ({listing.Quantity} {listing.UnitOfMeasurement}). Notes: {dto.Notes}",
                Timestamp = DateTimeOffset.UtcNow
            };
            _context.AuditLogs.Add(audit);
        }
        else
        {
            var audit = new AuditLog
            {
                AdminId = adminId,
                Action = "WarnProviderFoodWaste",
                TargetEntity = "FoodListing",
                TargetId = listingId.ToString(),
                Details = $"Official advisory sent to provider for expired surplus '{listing.FoodName}' ({listing.Quantity} {listing.UnitOfMeasurement}). Notes: {dto.Notes}",
                Timestamp = DateTimeOffset.UtcNow
            };
            _context.AuditLogs.Add(audit);

            await _notificationService.SendNotificationAsync(
                listing.ProviderId,
                "Food Waste Advisory Warning",
                $"Administrative Notice: Listing '{listing.FoodName}' ({listing.Quantity} {listing.UnitOfMeasurement}) expired without redistribution. Please schedule earlier pickup windows. Notes: {dto.Notes}",
                $"listing:{listingId}");
        }

        await _context.SaveChangesAsync();
        return Result.Success();
    }

    public async Task<Result<AdminUserListItemDto>> CreateAdminAsync(string adminId, CreateAdminDto dto)
    {
        if (_userManager == null)
        {
            return Result<AdminUserListItemDto>.Failure("User manager service is not configured.");
        }

        var currentAdmin = await _userManager.FindByIdAsync(adminId);
        if (currentAdmin == null || currentAdmin.UserType != UserType.Administrator)
        {
            return Result<AdminUserListItemDto>.Failure("Unauthorized. Only platform administrators can add new administrators.");
        }

        var existing = await _userManager.FindByEmailAsync(dto.Email.Trim());
        if (existing != null)
        {
            return Result<AdminUserListItemDto>.Failure($"An account with email '{dto.Email}' already exists.");
        }

        var newAdmin = new ApplicationUser
        {
            UserName = dto.Email.Trim(),
            Email = dto.Email.Trim(),
            EmailConfirmed = true,
            FullName = dto.FullName.Trim(),
            OrganizationName = "FoodBridge Platform Administration",
            OrganizationAddress = "FoodBridge Operations Center",
            UserType = UserType.Administrator,
            SpecificType = !string.IsNullOrWhiteSpace(dto.Department) ? dto.Department.Trim() : "Platform Administrator",
            PhoneNumber = dto.PhoneNumber?.Trim(),
            IsVerified = true,
            Status = UserStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        };

        var createResult = await _userManager.CreateAsync(newAdmin, dto.Password);
        if (!createResult.Succeeded)
        {
            return Result<AdminUserListItemDto>.Failure(createResult.Errors.Select(e => e.Description));
        }

        await _userManager.AddToRoleAsync(newAdmin, "Admin");

        var audit = new AuditLog
        {
            AdminId = adminId,
            Action = "CreateAdmin",
            TargetEntity = "ApplicationUser",
            TargetId = newAdmin.Id,
            Details = $"Administrator created new admin account for '{newAdmin.FullName}' ({newAdmin.Email}) - Department/Role: {newAdmin.SpecificType}",
            Timestamp = DateTimeOffset.UtcNow
        };
        _context.AuditLogs.Add(audit);
        await _context.SaveChangesAsync();

        return Result<AdminUserListItemDto>.Success(new AdminUserListItemDto
        {
            Id = newAdmin.Id,
            FullName = newAdmin.FullName,
            Email = newAdmin.Email ?? "",
            OrganizationName = newAdmin.OrganizationName,
            OrganizationAddress = newAdmin.OrganizationAddress,
            UserType = newAdmin.UserType,
            SpecificType = newAdmin.SpecificType,
            IsVerified = newAdmin.IsVerified,
            Status = newAdmin.Status,
            CreatedAt = newAdmin.CreatedAt,
            ActiveItemsCount = 0,
            CompletedItemsCount = 0
        });
    }

    public async Task<List<AuditLogDto>> GetAuditLogsAsync(int take = 100)
    {
        var logs = await _context.AuditLogs
            .Include(a => a.Admin)
            .OrderByDescending(a => a.Timestamp)
            .Take(take)
            .AsNoTracking()
            .ToListAsync();

        var userIds = logs
            .Where(a => a.TargetEntity == "ApplicationUser" && !string.IsNullOrWhiteSpace(a.TargetId))
            .Select(a => a.TargetId)
            .Distinct()
            .ToList();

        var usersDict = userIds.Count > 0
            ? await _context.Users
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new
                {
                    u.Id,
                    u.FullName,
                    u.OrganizationName,
                    u.Email,
                    u.UserType
                })
                .ToDictionaryAsync(u => u.Id, u => u)
            : new();

        var listingIds = logs
            .Where(a => a.TargetEntity == "FoodListing" && int.TryParse(a.TargetId, out _))
            .Select(a => int.Parse(a.TargetId))
            .Distinct()
            .ToList();

        var listingsDict = listingIds.Count > 0
            ? await _context.FoodListings
                .Include(f => f.Provider)
                .Where(f => listingIds.Contains(f.Id))
                .Select(f => new
                {
                    f.Id,
                    f.FoodName,
                    ProviderOrg = f.Provider != null ? f.Provider.OrganizationName : null
                })
                .ToDictionaryAsync(f => f.Id, f => f)
            : new();

        var reservationIds = logs
            .Where(a => a.TargetEntity == "Reservation" && int.TryParse(a.TargetId, out _))
            .Select(a => int.Parse(a.TargetId))
            .Distinct()
            .ToList();

        var reservationsDict = reservationIds.Count > 0
            ? await _context.Reservations
                .Include(r => r.FoodListing)
                .Include(r => r.Charity)
                .Where(r => reservationIds.Contains(r.Id))
                .Select(r => new
                {
                    r.Id,
                    FoodName = r.FoodListing != null ? r.FoodListing.FoodName : "تبرع طعام",
                    CharityName = r.Charity != null ? r.Charity.OrganizationName : "جمعية خيرية"
                })
                .ToDictionaryAsync(r => r.Id, r => r)
            : new();

        return logs.Select(a =>
        {
            var isAutoSecurity = a.Action == "AutoSecuritySuspension";
            var adminName = isAutoSecurity ? "نظام الأمان التلقائي (Security Bot)" : (a.Admin?.FullName ?? "مسؤول المنصة");
            var adminEmail = isAutoSecurity ? "security-bot@foodbridge.system" : (a.Admin?.Email ?? "");
            var adminRole = isAutoSecurity ? "Security System" : (a.Admin?.SpecificType ?? "Administrator");

            string? targetName = null;
            string? targetType = a.TargetEntity;

            if (a.TargetEntity == "ApplicationUser")
            {
                if (usersDict.TryGetValue(a.TargetId, out var u))
                {
                    targetName = !string.IsNullOrWhiteSpace(u.OrganizationName) && u.OrganizationName != u.FullName
                        ? $"{u.FullName} ({u.OrganizationName})"
                        : u.FullName;
                    targetType = u.UserType switch
                    {
                        UserType.FoodProvider => "Food Provider",
                        UserType.Charity => "Charity",
                        UserType.Administrator => "Administrator",
                        _ => "User"
                    };
                }
            }
            else if (a.TargetEntity == "FoodListing")
            {
                if (int.TryParse(a.TargetId, out var fId) && listingsDict.TryGetValue(fId, out var f))
                {
                    targetName = !string.IsNullOrWhiteSpace(f.ProviderOrg)
                        ? $"{f.FoodName} — {f.ProviderOrg}"
                        : f.FoodName;
                    targetType = "Food Listing";
                }
            }
            else if (a.TargetEntity == "Reservation")
            {
                if (int.TryParse(a.TargetId, out var rId) && reservationsDict.TryGetValue(rId, out var r))
                {
                    targetName = $"Reservation: {r.FoodName} for {r.CharityName}";
                    targetType = "Reservation";
                }
            }
            else if (a.TargetEntity == "System")
            {
                targetName = a.TargetId == "MaintenanceMode" ? "Platform Maintenance Mode" : "Platform Core Database";
                targetType = "System Core";
            }
            else if (a.TargetEntity == "Review")
            {
                targetName = $"Review #{a.TargetId}";
                targetType = "Review";
            }

            // Fallback: extract single-quoted entity name from Details if targetName wasn't resolved
            if (string.IsNullOrWhiteSpace(targetName) && !string.IsNullOrWhiteSpace(a.Details))
            {
                var firstQuote = a.Details.IndexOf('\'');
                if (firstQuote >= 0)
                {
                    var secondQuote = a.Details.IndexOf('\'', firstQuote + 1);
                    if (secondQuote > firstQuote)
                    {
                        targetName = a.Details.Substring(firstQuote + 1, secondQuote - firstQuote - 1);
                    }
                }
            }

            return new AuditLogDto
            {
                Id = a.Id,
                AdminId = a.AdminId,
                AdminName = adminName,
                AdminEmail = adminEmail,
                AdminRole = adminRole,
                Action = a.Action,
                TargetEntity = a.TargetEntity,
                TargetId = a.TargetId,
                TargetName = targetName,
                TargetType = targetType,
                Details = a.Details,
                Timestamp = a.Timestamp
            };
        }).ToList();
    }
}
