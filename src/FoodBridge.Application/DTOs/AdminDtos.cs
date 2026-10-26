using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using FoodBridge.Domain.Enums;

namespace FoodBridge.Application.DTOs;

public class AdminDashboardStatsDto
{
    public int TotalUsers { get; set; }
    public int TotalProviders { get; set; }
    public int TotalCharities { get; set; }
    public int PendingVerifications { get; set; }
    public int ActiveDonations { get; set; }
    public int CompletedDonations { get; set; }
    public int OutstandingRequests { get; set; }
    public decimal TotalRedistributedQuantity { get; set; }
    public int ReportedListingsCount { get; set; }
    public int ReportedReviewsCount { get; set; }
    public int ReportedProblemsCount { get; set; }
    public int ExpiredDonationsCount { get; set; }
    public decimal TotalWastedQuantity { get; set; }
}

public class AdminUserListItemDto
{
    public string Id { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string OrganizationName { get; set; } = string.Empty;
    public string OrganizationAddress { get; set; } = string.Empty;
    public UserType UserType { get; set; }
    public string UserTypeName => UserType.ToString();
    public string SpecificType { get; set; } = string.Empty;
    public string? TargetCommunityDescription { get; set; }
    public bool IsVerified { get; set; }
    public UserStatus Status { get; set; }
    public string StatusName => Status.ToString();
    public DateTimeOffset CreatedAt { get; set; }
    public int ActiveItemsCount { get; set; }
    public int CompletedItemsCount { get; set; }
    public int AccessFailedCount { get; set; }
    public bool IsLockedOut { get; set; }
    public DateTimeOffset? LockoutEnd { get; set; }
}

public class AdminUserFilterDto
{
    public UserType? UserType { get; set; }
    public bool? IsVerified { get; set; }
    public UserStatus? Status { get; set; }
    public string? SearchTerm { get; set; }
    public bool? LockedOnly { get; set; }
}

public class ModerationActionDto
{
    [Required, StringLength(500)]
    public string Reason { get; set; } = string.Empty;
}

public class ExpiredListingActionDto
{
    [Required]
    public string ActionType { get; set; } = "WarnProvider";

    [Required, StringLength(500)]
    public string Notes { get; set; } = string.Empty;
}

public class CreateAdminDto
{
    [Required, StringLength(100)]
    public string FullName { get; set; } = string.Empty;

    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(6)]
    public string Password { get; set; } = string.Empty;

    [StringLength(100)]
    public string? Department { get; set; }

    [Phone]
    public string? PhoneNumber { get; set; }
}

public class AuditLogDto
{
    public int Id { get; set; }
    public string AdminId { get; set; } = string.Empty;
    public string AdminName { get; set; } = string.Empty;
    public string? AdminEmail { get; set; }
    public string? AdminRole { get; set; }
    public string Action { get; set; } = string.Empty;
    public string TargetEntity { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string? TargetName { get; set; }
    public string? TargetType { get; set; }
    public string Details { get; set; } = string.Empty;
    public DateTimeOffset Timestamp { get; set; }
}
