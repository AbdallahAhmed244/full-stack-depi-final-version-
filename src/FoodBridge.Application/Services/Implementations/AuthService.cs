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

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IApplicationDbContext _context;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;
    private readonly IEmailSenderService _emailSender;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        IApplicationDbContext context,
        IJwtTokenGenerator jwtTokenGenerator,
        IEmailSenderService emailSender)
    {
        _userManager = userManager;
        _context = context;
        _jwtTokenGenerator = jwtTokenGenerator;
        _emailSender = emailSender;
    }

    public async Task<Result<AuthResponseDto>> RegisterProviderAsync(RegisterProviderDto dto)
    {
        var existing = await _userManager.FindByEmailAsync(dto.Email);
        if (existing != null)
        {
            return Result<AuthResponseDto>.Failure("An account with this email already exists.");
        }

        var user = new ApplicationUser
        {
            UserName = dto.Email,
            Email = dto.Email,
            FullName = dto.FullName,
            OrganizationName = dto.OrganizationName,
            OrganizationAddress = dto.OrganizationAddress,
            UserType = UserType.FoodProvider,
            SpecificType = dto.SpecificType,
            IsVerified = false,
            Status = UserStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        };

        var result = await _userManager.CreateAsync(user, dto.Password);
        if (!result.Succeeded)
        {
            return Result<AuthResponseDto>.Failure(result.Errors.Select(e => e.Description));
        }

        await _userManager.AddToRoleAsync(user, "Provider");

        var emailToken = await _userManager.GenerateEmailConfirmationTokenAsync(user);
        await _emailSender.SendVerificationEmailAsync(user.Email!, user.Id, emailToken);

        var roles = new List<string> { "Provider" };
        var jwt = _jwtTokenGenerator.GenerateToken(user, roles);

        return Result<AuthResponseDto>.Success(new AuthResponseDto
        {
            Token = jwt,
            UserId = user.Id,
            FullName = user.FullName,
            Email = user.Email!,
            Role = "Provider",
            OrganizationName = user.OrganizationName,
            IsVerified = user.IsVerified,
            SpecificType = user.SpecificType
        });
    }

    public async Task<Result<AuthResponseDto>> RegisterCharityAsync(RegisterCharityDto dto)
    {
        var existing = await _userManager.FindByEmailAsync(dto.Email);
        if (existing != null)
        {
            return Result<AuthResponseDto>.Failure("An account with this email already exists.");
        }

        var user = new ApplicationUser
        {
            UserName = dto.Email,
            Email = dto.Email,
            FullName = dto.FullName,
            OrganizationName = dto.OrganizationName,
            OrganizationAddress = dto.OrganizationAddress,
            UserType = UserType.Charity,
            SpecificType = dto.SpecificType,
            TargetCommunityDescription = dto.TargetCommunityDescription,
            IsVerified = false,
            Status = UserStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        };

        var result = await _userManager.CreateAsync(user, dto.Password);
        if (!result.Succeeded)
        {
            return Result<AuthResponseDto>.Failure(result.Errors.Select(e => e.Description));
        }

        await _userManager.AddToRoleAsync(user, "Charity");

        var emailToken = await _userManager.GenerateEmailConfirmationTokenAsync(user);
        await _emailSender.SendVerificationEmailAsync(user.Email!, user.Id, emailToken);

        var roles = new List<string> { "Charity" };
        var jwt = _jwtTokenGenerator.GenerateToken(user, roles);

        return Result<AuthResponseDto>.Success(new AuthResponseDto
        {
            Token = jwt,
            UserId = user.Id,
            FullName = user.FullName,
            Email = user.Email!,
            Role = "Charity",
            OrganizationName = user.OrganizationName,
            IsVerified = user.IsVerified,
            SpecificType = user.SpecificType
        });
    }

    public async Task<Result<AuthResponseDto>> LoginAsync(LoginDto dto)
    {
        var user = await _userManager.FindByEmailAsync(dto.Email);
        if (user == null)
        {
            return Result<AuthResponseDto>.Failure("Invalid email or password.");
        }

        if (user.Status == UserStatus.Suspended)
        {
            var audit = await _context.AuditLogs
                .Where(a => (a.TargetEntity == "ApplicationUser" && a.TargetId == user.Id)
                         || (a.AdminId == user.Id && a.Action == "AutoSecuritySuspension")
                         || (a.TargetEntity == "FoodListing" && a.Action == "SuspendProviderWasteViolation" && a.Details.Contains(user.FullName)))
                .OrderByDescending(a => a.Timestamp)
                .FirstOrDefaultAsync();

            string suspensionReason = audit?.Details ?? "";
            if (string.IsNullOrWhiteSpace(suspensionReason))
            {
                var notif = await _context.Notifications
                    .Where(n => n.UserId == user.Id && n.Title.Contains("Suspended"))
                    .OrderByDescending(n => n.CreatedAt)
                    .FirstOrDefaultAsync();
                suspensionReason = notif?.Message ?? "";
            }

            if (string.IsNullOrWhiteSpace(suspensionReason))
            {
                suspensionReason = "تم تعليق الحساب بقرار إداري لمراجعة سياسات المنصة ومعايير الالتزام.";
            }

            if (suspensionReason.Contains("Reason: "))
            {
                var idx = suspensionReason.IndexOf("Reason: ");
                suspensionReason = suspensionReason.Substring(idx + "Reason: ".Length).Trim();
            }

            var cleanReason = suspensionReason.Replace("||", " - ");
            var supportEmail = "ahlawy.ahmed25@gmail.com";
            var suspendedAt = audit?.Timestamp.ToString("o") ?? DateTimeOffset.UtcNow.ToString("o");

            return Result<AuthResponseDto>.Failure($"SUSPENDED||{cleanReason}||{supportEmail}||{user.FullName}||{user.OrganizationName}||{suspendedAt}");
        }

        if (await _userManager.IsLockedOutAsync(user))
        {
            var lockoutEnd = await _userManager.GetLockoutEndDateAsync(user);
            var remainingMinutes = lockoutEnd.HasValue ? Math.Max(1, (int)Math.Ceiling((lockoutEnd.Value - DateTimeOffset.UtcNow).TotalMinutes)) : 15;
            return Result<AuthResponseDto>.Failure($"Account is temporarily locked due to multiple failed login attempts. Please try again in {remainingMinutes} minutes.");
        }

        var passwordValid = await _userManager.CheckPasswordAsync(user, dto.Password);
        if (!passwordValid)
        {
            await _userManager.AccessFailedAsync(user);
            var isLocked = await _userManager.IsLockedOutAsync(user);
            var failedCount = await _userManager.GetAccessFailedCountAsync(user);

            if (isLocked)
            {
                var lockoutEnd = await _userManager.GetLockoutEndDateAsync(user);
                var remainingMinutes = lockoutEnd.HasValue 
                    ? Math.Max(1, (int)Math.Ceiling((lockoutEnd.Value - DateTimeOffset.UtcNow).TotalMinutes)) 
                    : 15;

                var securityAudit = new AuditLog
                {
                    AdminId = user.Id,
                    Action = "AutoSecuritySuspension",
                    TargetEntity = "ApplicationUser",
                    TargetId = user.Id,
                    Details = $"Account '{user.Email}' ({user.OrganizationName}) was locked out for 15 minutes after 10 failed login attempts (Brute-force protection).",
                    Timestamp = DateTimeOffset.UtcNow
                };
                _context.AuditLogs.Add(securityAudit);
                await _context.SaveChangesAsync();

                return Result<AuthResponseDto>.Failure($"Account has been locked for {remainingMinutes} minutes due to 10 consecutive failed login attempts.");
            }

            var remaining = Math.Max(0, 10 - failedCount);
            return Result<AuthResponseDto>.Failure($"Invalid email or password. ({remaining} attempts remaining before temporary account lockout)");
        }

        await _userManager.ResetAccessFailedCountAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        var primaryRole = roles.FirstOrDefault() ?? user.UserType.ToString();

        var jwt = _jwtTokenGenerator.GenerateToken(user, roles);

        return Result<AuthResponseDto>.Success(new AuthResponseDto
        {
            Token = jwt,
            UserId = user.Id,
            FullName = user.FullName,
            Email = user.Email!,
            Role = primaryRole,
            OrganizationName = user.OrganizationName,
            IsVerified = user.IsVerified,
            SpecificType = user.SpecificType
        });
    }

    public async Task<Result<string>> VerifyEmailAsync(string userId, string token)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
        {
            return Result<string>.Failure("User not found.");
        }

        var result = await _userManager.ConfirmEmailAsync(user, token);
        if (!result.Succeeded)
        {
            return Result<string>.Failure(result.Errors.Select(e => e.Description));
        }

        return Result<string>.Success("Email verified successfully! You may now access all authorized platform features.");
    }

    public async Task<Result<string>> ForgotPasswordAsync(string email)
    {
        var user = await _userManager.FindByEmailAsync(email);
        if (user == null)
        {
            return Result<string>.Success("If that email is registered, a password reset link has been dispatched.");
        }

        var resetToken = await _userManager.GeneratePasswordResetTokenAsync(user);
        await _emailSender.SendPasswordResetEmailAsync(user.Email!, resetToken);

        return Result<string>.Success("Password reset token dispatched to your email address.");
    }

    public async Task<Result<string>> ResetPasswordAsync(ResetPasswordDto dto)
    {
        var user = await _userManager.FindByEmailAsync(dto.Email);
        if (user == null)
        {
            return Result<string>.Failure("User not found.");
        }

        var result = await _userManager.ResetPasswordAsync(user, dto.Token, dto.NewPassword);
        if (!result.Succeeded)
        {
            return Result<string>.Failure(result.Errors.Select(e => e.Description));
        }

        return Result<string>.Success("Password has been successfully reset. You can now log in with your new password.");
    }

    public async Task<Result<UserProfileDto>> GetProfileAsync(string userId)
    {
        var user = await _context.Users
            .Include(u => u.ReviewsReceived)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
        {
            return Result<UserProfileDto>.Failure("User profile not found.");
        }

        double avgRating = 0;
        int reviewCount = 0;
        if (user.ReviewsReceived.Any(r => !r.IsReported))
        {
            var validReviews = user.ReviewsReceived.Where(r => !r.IsReported).ToList();
            avgRating = Math.Round(validReviews.Average(r => r.Rating), 1);
            reviewCount = validReviews.Count;
        }

        return Result<UserProfileDto>.Success(new UserProfileDto
        {
            UserId = user.Id,
            FullName = user.FullName,
            Email = user.Email ?? string.Empty,
            OrganizationName = user.OrganizationName,
            OrganizationAddress = user.OrganizationAddress,
            UserType = user.UserType,
            SpecificType = user.SpecificType,
            TargetCommunityDescription = user.TargetCommunityDescription,
            IsVerified = user.IsVerified,
            Status = user.Status,
            CreatedAt = user.CreatedAt,
            AverageRating = avgRating,
            TotalReviewsCount = reviewCount
        });
    }

    public async Task<Result<UserProfileDto>> UpdateProfileAsync(string userId, UpdateProfileDto dto)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null)
        {
            return Result<UserProfileDto>.Failure("User not found.");
        }

        user.FullName = dto.FullName;
        user.OrganizationName = dto.OrganizationName;
        user.OrganizationAddress = dto.OrganizationAddress;
        if (!string.IsNullOrWhiteSpace(dto.SpecificType))
        {
            user.SpecificType = dto.SpecificType;
        }
        if (dto.TargetCommunityDescription != null)
        {
            user.TargetCommunityDescription = dto.TargetCommunityDescription;
        }

        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            return Result<UserProfileDto>.Failure(result.Errors.Select(e => e.Description));
        }

        return await GetProfileAsync(userId);
    }

    public async Task<Result<string>> ResendVerificationEmailAsync(string email)
    {
        var user = await _userManager.FindByEmailAsync(email);
        if (user == null)
        {
            return Result<string>.Failure("User not found.");
        }

        if (await _userManager.IsEmailConfirmedAsync(user))
        {
            return Result<string>.Failure("Email address is already confirmed.");
        }

        var token = await _userManager.GenerateEmailConfirmationTokenAsync(user);
        await _emailSender.SendVerificationEmailAsync(user.Email!, user.Id, token);

        return Result<string>.Success("Verification email dispatched.");
    }
}