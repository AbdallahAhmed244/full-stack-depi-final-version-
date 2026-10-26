using System;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using FoodBridge.Application.Common.Interfaces;
using FoodBridge.Application.Services.Implementations;
using FoodBridge.Application.Services.Interfaces;
using FoodBridge.Domain.Entities;
using FoodBridge.Infrastructure.BackgroundServices;
using FoodBridge.Infrastructure.Data;
using FoodBridge.Infrastructure.Services;

namespace FoodBridge.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection") 
            ?? @"Server=(localdb)\MSSQLLocalDB;Database=FoodBridgeDb;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True";

        services.AddDbContext<FoodBridgeDbContext>(options =>
            options.UseSqlServer(connectionString, b => b.MigrationsAssembly(typeof(FoodBridgeDbContext).Assembly.FullName)));

        services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<FoodBridgeDbContext>());

        services.AddIdentity<ApplicationUser, IdentityRole>(options =>
        {
            options.Password.RequireDigit = true;
            options.Password.RequiredLength = 6;
            options.Password.RequireNonAlphanumeric = true;
            options.Password.RequireUppercase = false;
            options.Password.RequireLowercase = false;
            options.User.RequireUniqueEmail = true;
            options.SignIn.RequireConfirmedEmail = true;

            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            options.Lockout.MaxFailedAccessAttempts = 10;
            options.Lockout.AllowedForNewUsers = true;
        })
        .AddEntityFrameworkStores<FoodBridgeDbContext>()
        .AddDefaultTokenProviders();

        services.AddSingleton<IJwtTokenGenerator, JwtTokenGenerator>();
        services.AddScoped<IFileStorageService, LocalFileStorageService>();
        services.AddSingleton<IEmailSenderService, EmailSenderService>();
        services.AddScoped<INotificationService, NotificationService>();

        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IFoodListingService, FoodListingService>();
        services.AddScoped<IReservationService, ReservationService>();
        services.AddScoped<IReviewService, ReviewService>();
        services.AddScoped<IAdminService, AdminService>();
        services.AddScoped<IReportingService, ReportingService>();
        services.AddSingleton<IMaintenanceService, MaintenanceService>();

        services.AddHostedService<ListingExpirationHostedService>();
        services.AddHostedService<PickupReminderHostedService>();

        return services;
    }
}