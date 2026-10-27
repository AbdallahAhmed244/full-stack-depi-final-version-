async function loadAdminPortal() {
    if (!currentUser || currentUser.role !== 'Admin') {
        const isAr = currentLang === 'ar';
        showToast(isAr ? 'تنبيه أمني' : 'Administrator Required', isAr ? 'يرجى تسجيل الدخول بحساب المشرف.' : 'Please switch to the Administrator profile.', 'warning');
        navigateTo('landing');
        return;
    }

    await loadAdminStats();
    await loadAdminVerifications();
    await loadAdminUsers();
    await loadAdminModeration();
    await loadAdminAuditLogs();
    await loadAdminExpiredListings();
}

async function loadAdminStats() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_BASE}/admin/dashboard`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        if (res.ok) {
            const data = await res.json();
            document.getElementById('adminStatUsers').textContent = data.totalUsers;
            document.getElementById('adminStatProviders').textContent = data.totalProviders;
            document.getElementById('adminStatCharities').textContent = data.totalCharities;
            document.getElementById('adminStatPendingVerifications').textContent = data.pendingVerifications;
            document.getElementById('adminBadgeVerifications').textContent = data.pendingVerifications;
            document.getElementById('adminStatCompleted').textContent = data.completedDonations;
            const isAr = currentLang === 'ar';
            document.getElementById('adminStatRedistributed').textContent = `${data.totalRedistributedQuantity} ${isAr ? 'وحدة' : 'units'}`;
            document.getElementById('adminStatReports').textContent = data.reportedListingsCount + data.reportedReviewsCount + data.reportedProblemsCount;
            if (document.getElementById('adminStatWastedQuantity')) {
                document.getElementById('adminStatWastedQuantity').textContent = `${data.totalWastedQuantity} ${isAr ? 'كجم' : 'kg'}`;
            }
            if (document.getElementById('adminStatExpiredCount')) {
                document.getElementById('adminStatExpiredCount').textContent = data.expiredDonationsCount;
            }
            if (document.getElementById('adminBadgeExpiredCount')) {
                document.getElementById('adminBadgeExpiredCount').textContent = data.expiredDonationsCount;
            }
        }
    } catch (err) {
        console.error('Error fetching admin dashboard:', err);
    }
}

async function loadAdminVerifications() {
    if (!currentUser) return;
    const container = document.getElementById('adminVerificationList');
    try {
        const res = await fetch(`${API_BASE}/admin/users?isVerified=false&status=1`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const users = await res.json();
        // Only active unverified users (exclude admins and suspended/rejected users)
        const pending = users.filter(u => u.userType !== 3 && !u.isVerified && (u.status === 1 || u.status === 'Active'));

        const dict = i18nDict[currentLang] || i18nDict.en;
        const isAr = currentLang === 'ar';

        if (!pending || pending.length === 0) {
            container.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs">${isAr ? 'لا توجد طلبات توثيق معلقة حالياً. جميع المنظمات معتمدة.' : 'No pending verification requests at this time. All organizations are cleared.'}</div>`;
            return;
        }

        container.innerHTML = pending.map(u => `
            <div id="verif-card-${u.id}" class="p-4 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300">
                <div>
                    <div class="flex items-center space-x-2 mb-1">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.userType === 1 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                            ${u.userType === 1 ? (isAr ? 'مزود طعام' : 'Provider') : (isAr ? 'جمعية خيرية' : 'Charity')}: ${escapeHtml(u.specificType)}
                        </span>
                        <span class="text-xs text-slate-400">${isAr ? 'تاريخ التسجيل' : 'Registered'} ${new Date(u.createdAt).toLocaleDateString(isAr ? 'ar-EG' : [])}</span>
                    </div>
                    <h4 class="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">${escapeHtml(u.organizationName)} (${escapeHtml(u.fullName)})</h4>
                    <div class="text-xs text-slate-600 dark:text-slate-400 mt-0.5"><i class="fa-solid fa-location-dot ${isAr ? 'ml-1' : 'mr-1'} text-slate-400"></i> ${escapeHtml(u.organizationAddress)} • ${escapeHtml(u.email)}</div>
                    ${u.targetCommunityDescription ? `<div class="text-[11px] text-slate-500 mt-1.5 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700"><strong>${isAr ? 'الفئات المستفيدة:' : 'Served Population:'}</strong> ${escapeHtml(u.targetCommunityDescription)}</div>` : ''}
                </div>
                <div class="shrink-0 flex items-center space-x-2">
                    <button onclick="verifyOrganization('${u.id}', true)" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition">
                        <i class="fa-solid fa-check ${isAr ? 'ml-1' : 'mr-1'}"></i> ${dict.approve}
                    </button>
                    <button onclick="verifyOrganization('${u.id}', false)" class="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-100 border border-rose-200 transition">
                        <i class="fa-solid fa-xmark ${isAr ? 'ml-1' : 'mr-1'}"></i> ${dict.reject}
                    </button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Error fetching verifications:', err);
    }
}

async function verifyOrganization(userId, isApproved) {
    const isAr = currentLang === 'ar';
    const confirmPrompt = isApproved
        ? (isAr ? 'هل تريد اعتماد وتوثيق هذه المنظمة رسمياً؟' : 'Approve and verify this organization?')
        : (isAr ? 'هل تريد رفض طلب الاعتماد وتجميد هذا الحساب لمنع دخوله المنصة؟' : 'Reject verification and suspend this account?');

    if (!confirm(confirmPrompt)) return;

    try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}/verify?approve=${isApproved}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        if (res.ok) {
            showToast(
                isApproved ? (isAr ? 'تم اعتماد المنظمة' : 'Organization Approved') : (isAr ? 'تم رفض طلب الاعتماد' : 'Verification Rejected'),
                isApproved
                    ? (isAr ? 'تم اعتماد المنظمة وتفعيل حسابها بنجاح.' : 'Organization approved and verified.')
                    : (isAr ? 'تم رفض طلب الاعتماد وتجميد الحساب بنجاح.' : 'Verification rejected and account suspended.'),
                'success'
            );
            await loadAdminVerifications();
            await loadAdminStats();
            await loadAdminUsers();
            await loadAdminAuditLogs();
        } else {
            const errData = await res.json().catch(() => ({}));
            showToast(isAr ? 'خطأ' : 'Error', errData.message || (isAr ? 'تعذر تنفيذ الإجراء' : 'Failed to update verification'), 'error');
        }
    } catch (err) {
        showToast(isAr ? 'خطأ في الاتصال' : 'Connection Error', err.message, 'error');
    }
}

let adminUserSearchTimer = null;
function handleAdminUserSearch() {
    clearTimeout(adminUserSearchTimer);
    adminUserSearchTimer = setTimeout(() => {
        loadAdminUsers();
    }, 250);
}

async function loadAdminUsers() {
    if (!currentUser) return;
    const search = document.getElementById('adminUserSearch')?.value?.trim() || '';
    const userType = document.getElementById('adminUserTypeFilter')?.value || '';
    const status = document.getElementById('adminUserStatusFilter')?.value || '';
    const tbody = document.getElementById('adminUsersTableBody');
    const dict = i18nDict[currentLang] || i18nDict.en;
    const isAr = currentLang === 'ar';

    const params = new URLSearchParams();
    if (search) params.append('searchTerm', search);
    if (userType) params.append('userType', userType);
    if (status === 'locked') {
        params.append('lockedOnly', 'true');
    } else if (status) {
        params.append('status', status);
    }

    try {
        const res = await fetch(`${API_BASE}/admin/users?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const users = await res.json();

        if (!users || users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                        <i class="fa-solid fa-user-slash text-2xl mb-2 block"></i>
                        <span>${isAr ? 'لا يوجد مستخدمون مطابقون للبحث الحالي.' : 'No users match the current search criteria.'}</span>
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = users.map(u => {
            const isSuspended = u.status === 2 || u.status === 'Suspended';
            const isCurrentlyLocked = u.isLockedOut || u.accessFailedCount >= 10;
            const hadLockout = !!u.lockoutEnd;

            const statusBadge = isSuspended 
                ? (isCurrentlyLocked ? 'bg-rose-600 text-white font-black' : 'bg-rose-100 text-rose-800') 
                : (isCurrentlyLocked ? 'bg-rose-500 text-white font-black' : 'bg-emerald-100 text-emerald-800');
            const verifiedBadge = u.isVerified ? `<span class="text-emerald-600"><i class="fa-solid fa-circle-check"></i> ${isAr ? 'موثق' : 'Verified'}</span>` : `<span class="text-amber-500"><i class="fa-solid fa-clock"></i> ${isAr ? 'معلق' : 'Pending'}</span>`;

            let secBadge = '';
            if (isCurrentlyLocked) {
                secBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse" title="${isAr ? 'تم قفل الحساب بسبب تكرار كلمة السر الخاطئة' : 'Account locked due to consecutive failed password attempts'}"><i class="fa-solid fa-lock text-[9px]"></i>${isAr ? '🔒 مقفول أمنياً (كلمة سر)' : '🔒 Locked Out (Password Failures)'}</span>`;
            } else if (hadLockout) {
                secBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800" title="${isAr ? 'سجل قفل أمني سابق لمحاولات تسجيل خاطئة' : 'Prior security lockout for failed password attempts'}"><i class="fa-solid fa-shield-halved text-[9px]"></i>${isAr ? '🔒 سجل قفل أمني' : '🔒 Prior Password Lockout'}</span>`;
            } else if (u.accessFailedCount > 0) {
                secBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700" title="${isAr ? 'محاولات باسورد فاشلة' : 'Failed password attempts'}"><i class="fa-solid fa-key text-[9px]"></i>${u.accessFailedCount} ${isAr ? 'محاولات فاشلة' : 'Failed Attempts'}</span>`;
            }

            let toggleAction = '';
            if (currentUser && (u.id === currentUser.userId || u.email === currentUser.email)) {
                toggleAction = `<span class="text-xs text-slate-400 italic">${isAr ? 'حسابك الحالي' : 'Current Account'}</span>`;
            } else if (isSuspended) {
                toggleAction = `<button onclick="setUserStatus('${u.id}', false)" class="px-2.5 py-1 text-xs font-semibold rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition shadow-sm inline-flex items-center"><i class="fa-solid fa-lock-open mr-1"></i>${isAr ? 'إلغاء الحظر والتفعيل' : 'Unblock & Activate'}</button>`;
            } else if (isCurrentlyLocked || hadLockout || u.accessFailedCount > 0) {
                toggleAction = `
                    <div class="flex items-center gap-1.5 ${isAr ? 'justify-start' : 'justify-end'}">
                        <button onclick="setUserStatus('${u.id}', true)" class="px-2.5 py-1 text-xs font-semibold rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 transition shadow-sm inline-flex items-center" title="${isAr ? 'حظر هذا الحساب' : 'Block / Suspend account'}">
                            <i class="fa-solid fa-ban mr-1"></i>${isAr ? 'حظر (بلوك)' : 'Block'}
                        </button>
                        <button onclick="setUserStatus('${u.id}', false)" class="px-2.5 py-1 text-xs font-semibold rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition shadow-sm inline-flex items-center" title="${isAr ? 'إلغاء القفل وتصفير عداد المحاولات' : 'Reset lockout and failed attempts'}">
                            <i class="fa-solid fa-lock-open mr-1"></i>${isAr ? 'إلغاء القفل' : 'Unlock'}
                        </button>
                    </div>
                `;
            } else {
                toggleAction = `<button onclick="setUserStatus('${u.id}', true)" class="px-2.5 py-1 text-xs font-semibold rounded-lg text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition inline-flex items-center"><i class="fa-solid fa-ban mr-1"></i>${dict.suspend}</button>`;
            }

            const uTypeName = u.userType === 1 ? (isAr ? 'مزود طعام' : 'Provider') : u.userType === 2 ? (isAr ? 'جمعية خيرية' : 'Charity') : (isAr ? 'مشرف' : 'Admin');
            const displayStatus = isCurrentlyLocked 
                ? (isAr ? 'مقفول أمنياً' : 'Locked Out')
                : (isSuspended ? (isAr ? 'مجمّد' : 'Suspended') : (isAr ? 'نشط' : 'Active'));

            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                    <td class="px-4 py-3">
                        <div class="flex items-center flex-wrap gap-1.5">
                            <span class="font-bold text-slate-800 dark:text-slate-100">${escapeHtml(u.organizationName)}</span>
                            ${secBadge}
                        </div>
                        <div class="text-xs text-slate-500">${escapeHtml(u.fullName)} • <span class="font-mono text-slate-700 dark:text-slate-300 font-medium">${escapeHtml(u.email)}</span></div>
                    </td>
                    <td class="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">${uTypeName} (${escapeHtml(u.specificType)})</td>
                    <td class="px-4 py-3 text-xs font-semibold">${verifiedBadge}</td>
                    <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${statusBadge}">${displayStatus}</span></td>
                    <td class="px-4 py-3 ${isAr ? 'text-left' : 'text-right'}">${toggleAction}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error fetching admin users:', err);
    }
}

async function setUserStatus(userId, suspend) {
    const isAr = currentLang === 'ar';
    let reason = '';
    if (suspend) {
        reason = prompt(isAr 
            ? 'يرجى كتابة سبب تعليق الحساب (سيظهر للمستخدم عند محاولة تسجيل الدخول):' 
            : 'Enter suspension reason (will be displayed to the user when logging in):');
        if (reason === null) return;
    } else {
        if (!confirm(isAr ? 'هل أنت متأكد من إعادة تفعيل هذا الحساب وإلغاء قفله الأمني؟' : 'Reactivate this account and unlock password attempts?')) return;
    }

    try {
        const query = `suspend=${suspend}` + (reason ? `&reason=${encodeURIComponent(reason.trim())}` : '');
        const res = await fetch(`${API_BASE}/admin/users/${userId}/status?${query}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        if (res.ok) {
            showToast(
                isAr ? 'تم تحديث حالة الحساب' : 'Account Status Updated',
                suspend ? (isAr ? 'تم تعليق الحساب وحفظ السبب.' : 'User suspended.') : (isAr ? 'تمت إعادة تفعيل الحساب وإلغاء القفل الأمني بنجاح.' : 'User reactivated and unlocked successfully.'),
                'info'
            );
            loadAdminUsers();
            loadAdminAuditLogs();
        } else {
            const errData = await res.json().catch(() => ({}));
            showToast(isAr ? 'عملية مرفوضة' : 'Operation Blocked', errData.message || 'Failed to update user status.', 'warning');
        }
    } catch (err) {
        showToast(isAr ? 'خطأ' : 'Error', err.message, 'error');
    }
}

function openCreateAdminModal() {
    const modal = document.getElementById('createAdminModal');
    if (!modal) return;
    document.getElementById('newAdminFullName').value = '';
    document.getElementById('newAdminEmail').value = '';
    document.getElementById('newAdminDepartment').value = '';
    document.getElementById('newAdminPhone').value = '';
    document.getElementById('newAdminPassword').value = '';
    modal.classList.remove('hidden');
}

function closeCreateAdminModal() {
    const modal = document.getElementById('createAdminModal');
    if (modal) modal.classList.add('hidden');
}

async function handleCreateAdminSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;
    const isAr = currentLang === 'ar';

    const submitBtn = document.getElementById('btnSubmitNewAdmin');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> ${isAr ? 'جاري الإنشاء...' : 'Creating...'}`;
    }

    const payload = {
        fullName: document.getElementById('newAdminFullName').value.trim(),
        email: document.getElementById('newAdminEmail').value.trim(),
        department: document.getElementById('newAdminDepartment').value.trim(),
        phoneNumber: document.getElementById('newAdminPhone').value.trim(),
        password: document.getElementById('newAdminPassword').value
    };

    try {
        const res = await fetch(`${API_BASE}/admin/create-admin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeCreateAdminModal();
            showToast(
                isAr ? 'تم بنجاح' : 'Success',
                isAr ? `تم إنشاء حساب المشرف (${payload.fullName}) بنجاح.` : `Administrator account for '${payload.fullName}' created successfully.`,
                'success'
            );
            await loadAdminStats();
            await loadAdminUsers();
            await loadAdminAuditLogs();
        } else {
            const errData = await res.json().catch(() => ({}));
            showToast(
                isAr ? 'خطأ في الإنشاء' : 'Creation Failed',
                errData.message || (isAr ? 'تعذر إنشاء حساب المشرف. يرجى التحقق من البيانات.' : 'Failed to create administrator.'),
                'error'
            );
        }
    } catch (err) {
        showToast('Error', err.message, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

async function loadAdminModeration() {
    if (!currentUser) return;
    const isAr = currentLang === 'ar';
    try {
        const [listingsRes, reviewsRes, problemsRes] = await Promise.all([
            fetch(`${API_BASE}/admin/reported-listings`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } }),
            fetch(`${API_BASE}/admin/reported-reviews`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } }),
            fetch(`${API_BASE}/admin/problem-reports`, { headers: { 'Authorization': `Bearer ${currentUser.token}` } })
        ]);

        const listings = await listingsRes.json();
        const reviews = await reviewsRes.json();
        const problems = await problemsRes.json();

        const lContainer = document.getElementById('adminReportedListingsContainer');
        lContainer.innerHTML = listings.length === 0 ? `<div class="text-slate-400">${isAr ? 'لا توجد عروض تبرع مبلّغ عنها.' : 'No reported listings.'}</div>` : listings.map(l => `
            <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700">
                <div class="font-bold text-slate-800 dark:text-slate-100">${escapeHtml(l.foodName)}</div>
                <div class="text-rose-600 mt-1">${isAr ? 'سبب البلاغ:' : 'Reason:'} ${escapeHtml(l.reportReason || (isAr ? 'فحص ومراجعة' : 'Policy check'))}</div>
                <div class="mt-2 flex ${isAr ? 'justify-start' : 'justify-end'}">
                    <button onclick="removeListingByAdmin(${l.id})" class="px-2.5 py-1 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition">${isAr ? 'حذف التبرع' : 'Remove Listing'}</button>
                </div>
            </div>
        `).join('');

        const rContainer = document.getElementById('adminReportedReviewsContainer');
        rContainer.innerHTML = reviews.length === 0 ? `<div class="text-slate-400">${isAr ? 'لا توجد تقييمات مبلّغ عنها.' : 'No reported reviews.'}</div>` : reviews.map(r => `
            <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700">
                <div class="font-bold text-slate-800 dark:text-slate-100">${escapeHtml(r.reviewerName)}: ⭐ ${r.rating}</div>
                <div class="text-slate-600 dark:text-slate-300 italic mt-1">"${escapeHtml(r.comment || (isAr ? 'بدون تعليق' : 'No text'))}"</div>
                <div class="text-rose-600 mt-1">${isAr ? 'سبب البلاغ:' : 'Reason:'} ${escapeHtml(r.reportReason || (isAr ? 'محتوى غير لائق' : 'Inappropriate'))}</div>
                <div class="mt-2 flex ${isAr ? 'justify-start' : 'justify-end'}">
                    <button onclick="removeReviewByAdmin(${r.id})" class="px-2.5 py-1 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition">${isAr ? 'حذف التقييم' : 'Delete Review'}</button>
                </div>
            </div>
        `).join('');

        const pContainer = document.getElementById('adminProblemReportsContainer');
        pContainer.innerHTML = problems.length === 0 ? `<div class="text-slate-400">${isAr ? 'لا توجد نزاعات استلام حالية.' : 'No active pickup disputes.'}</div>` : problems.map(p => `
            <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700">
                <div class="font-bold text-slate-800 dark:text-slate-100">${escapeHtml(p.foodName)}</div>
                <div class="text-xs text-slate-500">${escapeHtml(p.charityOrganization)} ${isAr ? 'ضد' : 'vs'} ${escapeHtml(p.providerOrganization)}</div>
                <div class="text-rose-600 mt-1">${escapeHtml(p.problemDescription)}</div>
                <div class="mt-2 flex ${isAr ? 'justify-start' : 'justify-end'}">
                    <button onclick="resolveProblemByAdmin(${p.id})" class="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition">${isAr ? 'حل النزاع' : 'Resolve Dispute'}</button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Error fetching admin moderation items:', err);
    }
}

async function removeListingByAdmin(id) {
    const isAr = currentLang === 'ar';
    const reason = prompt(isAr ? 'يرجى كتابة سبب الحذف الإداري للتبرع:' : 'Specify administrative removal reason:');
    if (!reason) return;
    try {
        const res = await fetch(`${API_BASE}/admin/listings/${id}/remove`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ reason })
        });
        if (res.ok) {
            showToast('Listing Removed', 'Item removed and reason logged to AuditLog.', 'info');
            loadAdminModeration();
            loadAdminAuditLogs();
        }
    } catch (err) {
        showToast('Error', err.message, 'error');
    }
}

async function removeReviewByAdmin(id) {
    const isAr = currentLang === 'ar';
    const reason = prompt(isAr ? 'يرجى كتابة سبب حذف هذا التقييم:' : 'Specify administrative review deletion reason:');
    if (!reason) return;
    try {
        const res = await fetch(`${API_BASE}/admin/reviews/${id}/remove`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ reason })
        });
        if (res.ok) {
            showToast('Review Removed', 'Review deleted and reason logged.', 'info');
            loadAdminModeration();
            loadAdminAuditLogs();
        }
    } catch (err) {
        showToast('Error', err.message, 'error');
    }
}

async function resolveProblemByAdmin(id) {
    const isAr = currentLang === 'ar';
    const notes = prompt(isAr ? 'يرجى إدخال ملاحظات وقرار حل هذا النزاع:' : 'Enter resolution notes for this problem dispute:');
    if (!notes) return;
    try {
        const res = await fetch(`${API_BASE}/admin/problems/${id}/resolve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ reason: notes })
        });
        if (res.ok) {
            showToast('Report Resolved', 'Pickup problem report marked as resolved.', 'success');
            loadAdminModeration();
            loadAdminAuditLogs();
        }
    } catch (err) {
        showToast('Error', err.message, 'error');
    }
}

let allAdminAuditLogs = [];
let currentAuditFilter = 'all';
let currentAuditSearch = '';
let currentFilteredAuditLogs = [];
let currentSelectedAuditLog = null;

const ADMIN_AUDIT_ACTIONS = {
    'SuspendUser': {
        ar: 'تجميد حساب مستخدم',
        en: 'Suspend User',
        icon: 'fa-solid fa-user-slash',
        category: 'users',
        badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
    },
    'ReactivateUser': {
        ar: 'تفعيل وإلغاء تجميد',
        en: 'Reactivate User',
        icon: 'fa-solid fa-user-check',
        category: 'users',
        badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
    },
    'AutoSecuritySuspension': {
        ar: 'تجميد أمني تلقائي (محاولات فاشلة)',
        en: 'Auto Security Lockout',
        icon: 'fa-solid fa-shield-halved',
        category: 'users',
        badgeClass: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
    },
    'CreateAdmin': {
        ar: 'إنشاء مشرف إداري',
        en: 'Create Admin',
        icon: 'fa-solid fa-user-shield',
        category: 'users',
        badgeClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
    },
    'ApproveVerification': {
        ar: 'اعتماد وتوثيق مؤسسة',
        en: 'Approve Verification',
        icon: 'fa-solid fa-circle-check',
        category: 'verifications',
        badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
    },
    'VerifyOrganization': {
        ar: 'اعتماد وتوثيق مؤسسة',
        en: 'Approve Verification',
        icon: 'fa-solid fa-circle-check',
        category: 'verifications',
        badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
    },
    'RejectVerification': {
        ar: 'رفض توثيق مؤسسة',
        en: 'Reject Verification',
        icon: 'fa-solid fa-circle-xmark',
        category: 'verifications',
        badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
    },
    'RejectOrganization': {
        ar: 'رفض توثيق مؤسسة',
        en: 'Reject Verification',
        icon: 'fa-solid fa-circle-xmark',
        category: 'verifications',
        badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
    },
    'RemoveListing': {
        ar: 'حذف إدراج طعام',
        en: 'Remove Food Listing',
        icon: 'fa-solid fa-trash-can',
        category: 'content',
        badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
    },
    'RemoveReview': {
        ar: 'حذف تقييم مسيء',
        en: 'Remove Review',
        icon: 'fa-solid fa-star-half-stroke',
        category: 'content',
        badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
    },
    'ResolveProblem': {
        ar: 'حل نزاع استلام',
        en: 'Resolve Dispute',
        icon: 'fa-solid fa-handshake-angle',
        category: 'content',
        badgeClass: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
    },
    'ResolveProblemReport': {
        ar: 'حل نزاع استلام',
        en: 'Resolve Dispute',
        icon: 'fa-solid fa-handshake-angle',
        category: 'content',
        badgeClass: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
    },
    'SuspendProviderWasteViolation': {
        ar: 'تجميد مورد (مخالفة هدر)',
        en: 'Waste Violation Suspension',
        icon: 'fa-solid fa-triangle-exclamation',
        category: 'waste',
        badgeClass: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
    },
    'WarnProviderFoodWaste': {
        ar: 'إنذار وتنبيه هدر طعام',
        en: 'Food Waste Advisory',
        icon: 'fa-solid fa-bell',
        category: 'waste',
        badgeClass: 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
    },
    'RecordWasteDisposal': {
        ar: 'توثيق إتلاف وتخلص آمن',
        en: 'Safe Disposal Logged',
        icon: 'fa-solid fa-recycle',
        category: 'waste',
        badgeClass: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
    },
    'EnableMaintenanceMode': {
        ar: 'تفعيل وضع الصيانة العام',
        en: 'Enable Maintenance',
        icon: 'fa-solid fa-lock',
        category: 'system',
        badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
    },
    'DisableMaintenanceMode': {
        ar: 'إنهاء وضع الصيانة',
        en: 'Disable Maintenance',
        icon: 'fa-solid fa-lock-open',
        category: 'system',
        badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
    },
    'SystemProvisioning': {
        ar: 'تهيئة وتأسيس المنصة',
        en: 'System Provisioning',
        icon: 'fa-solid fa-server',
        category: 'system',
        badgeClass: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600'
    }
};

function parseAuditLogReason(details) {
    if (!details) return { main: '', reason: null };
    const markers = ['Reason: ', 'Notes: ', 'المبرر: ', 'السبب: '];
    for (const marker of markers) {
        const idx = details.indexOf(marker);
        if (idx !== -1) {
            return {
                main: details.substring(0, idx).trim(),
                reason: details.substring(idx + marker.length).trim()
            };
        }
    }
    return { main: details.trim(), reason: null };
}

async function loadAdminAuditLogs() {
    if (!currentUser) return;
    const isAr = currentLang === 'ar';
    const tbody = document.getElementById('adminAuditTableBody');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_BASE}/admin/audit-logs?take=100`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        if (!res.ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-rose-500 text-xs">${isAr ? 'تعذر جلب سجلات التدقيق.' : 'Failed to fetch audit logs.'}</td></tr>`;
            return;
        }
        allAdminAuditLogs = await res.json() || [];
        const countBadge = document.getElementById('auditLogsCountBadge');
        if (countBadge) {
            countBadge.textContent = isAr ? `${allAdminAuditLogs.length} سجل` : `${allAdminAuditLogs.length} logs`;
        }
        renderAdminAuditLogs();
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-rose-500 text-xs">${isAr ? 'خطأ في الاتصال بالخادم.' : 'Server connection error.'}</td></tr>`;
    }
}

function filterAuditLogs(category) {
    currentAuditFilter = category;
    document.querySelectorAll('.audit-filter-pill').forEach(btn => {
        btn.className = 'audit-filter-pill px-3 py-1.5 rounded-xl font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition shrink-0';
    });
    const activeBtn = document.getElementById(`auditFilterBtn-${category}`);
    if (activeBtn) {
        activeBtn.className = 'audit-filter-pill px-3 py-1.5 rounded-xl font-bold bg-indigo-600 text-white shadow-xs transition shrink-0';
    }
    renderAdminAuditLogs();
}

function handleAuditSearch(event) {
    currentAuditSearch = (event.target.value || '').trim().toLowerCase();
    renderAdminAuditLogs();
}

function renderAdminAuditLogs() {
    const isAr = currentLang === 'ar';
    const tbody = document.getElementById('adminAuditTableBody');
    if (!tbody) return;

    currentFilteredAuditLogs = allAdminAuditLogs.filter(l => {
        if (currentAuditFilter !== 'all') {
            const conf = ADMIN_AUDIT_ACTIONS[l.action];
            const cat = conf ? conf.category : 'other';
            if (cat !== currentAuditFilter) return false;
        }
        if (currentAuditSearch) {
            const searchHaystack = [
                l.adminName,
                l.adminEmail,
                l.action,
                l.targetEntity,
                l.targetId,
                l.targetName,
                l.targetType,
                l.details
            ].filter(Boolean).join(' ').toLowerCase();

            if (!searchHaystack.includes(currentAuditSearch)) return false;
        }
        return true;
    });

    if (currentFilteredAuditLogs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                    <i class="fa-solid fa-folder-open text-2xl mb-2 block"></i>
                    <span>${isAr ? 'لا توجد سجلات مطابقة للبحث أو التصفية الحالية.' : 'No audit records match the current search/filter.'}</span>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = currentFilteredAuditLogs.map((l, index) => {
        const conf = ADMIN_AUDIT_ACTIONS[l.action] || {
            ar: l.action,
            en: l.action,
            icon: 'fa-solid fa-circle-dot',
            badgeClass: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
        };

        const actionTitle = isAr ? conf.ar : conf.en;

        const dateObj = new Date(l.timestamp);
        const dateStr = dateObj.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const isAutoSecurity = l.action === 'AutoSecuritySuspension' || (l.adminEmail && l.adminEmail.includes('security-bot'));
        const adminInitials = (l.adminName || 'AD').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

        const shortTargetId = l.targetId && l.targetId.length > 12 ? `${l.targetId.substring(0, 8)}...` : (l.targetId || 'N/A');
        let targetTitle = l.targetName || `${l.targetEntity} #${shortTargetId}`;
        if (!isAr) {
            if (targetTitle.includes('نظام وضع الصيانة') || l.targetId === 'MaintenanceMode') {
                targetTitle = 'Platform Maintenance Mode';
            } else if (targetTitle.includes('قاعدة بيانات المنصة')) {
                targetTitle = 'Platform Core Database';
            } else if (targetTitle.startsWith('حجز:')) {
                targetTitle = targetTitle.replace('حجز:', 'Reservation:').replace('لصالح:', 'for:');
            } else if (targetTitle.startsWith('تقييم رقم #')) {
                targetTitle = targetTitle.replace('تقييم رقم #', 'Review #');
            }
        } else {
            if (targetTitle === 'Platform Maintenance Mode' || targetTitle === 'Platform Maintenance System') {
                targetTitle = 'نظام وضع الصيانة للمنصة';
            } else if (targetTitle === 'Platform Core Database') {
                targetTitle = 'قاعدة بيانات المنصة والنظام';
            } else if (targetTitle.startsWith('Reservation:')) {
                targetTitle = targetTitle.replace('Reservation:', 'حجز:').replace('for:', 'لصالح:');
            } else if (targetTitle.startsWith('Review #')) {
                targetTitle = targetTitle.replace('Review #', 'تقييم رقم #');
            }
        }

        // Clean up target subtitle so no Arabic leaks into English and vice-versa
        let rawTargetType = l.targetType || l.targetEntity || '';
        let cleanTargetSubtitle = rawTargetType;
        if (isAr) {
            if (rawTargetType.includes('Food Provider') || rawTargetType === 'Provider') {
                cleanTargetSubtitle = 'مزود طعام';
            } else if (rawTargetType.includes('Charity')) {
                cleanTargetSubtitle = 'جمعية خيرية';
            } else if (rawTargetType.includes('Administrator') || rawTargetType === 'Admin') {
                cleanTargetSubtitle = 'مشرف نظام';
            } else if (rawTargetType.includes('Food Listing')) {
                cleanTargetSubtitle = 'إدراج تبرع طعام';
            } else if (rawTargetType.includes('Reservation')) {
                cleanTargetSubtitle = 'حجز استلام';
            } else if (rawTargetType.includes('System Core') || rawTargetType === 'System') {
                cleanTargetSubtitle = 'إعدادات النظام';
            } else if (rawTargetType.includes('Review')) {
                cleanTargetSubtitle = 'تقييم جودة';
            } else if (rawTargetType.includes('User')) {
                cleanTargetSubtitle = 'مستخدم';
            } else if (rawTargetType.includes(' (')) {
                cleanTargetSubtitle = rawTargetType.split(' (')[0];
            }
        } else {
            const m = rawTargetType.match(/\(([^)]+)\)/);
            if (m) {
                cleanTargetSubtitle = m[1];
            } else if (rawTargetType.includes('مشرف')) {
                cleanTargetSubtitle = 'Administrator';
            } else if (rawTargetType.includes('مانحة') || rawTargetType.includes('مورد')) {
                cleanTargetSubtitle = 'Food Provider';
            } else if (rawTargetType.includes('جمعية')) {
                cleanTargetSubtitle = 'Charity';
            } else if (rawTargetType.includes('إدراج')) {
                cleanTargetSubtitle = 'Food Listing';
            } else if (rawTargetType.includes('حجز')) {
                cleanTargetSubtitle = 'Reservation';
            } else if (rawTargetType.includes('تقييم')) {
                cleanTargetSubtitle = 'Review';
            } else if (rawTargetType.includes('النظام')) {
                cleanTargetSubtitle = 'System Core';
            }
        }

        const parsed = parseAuditLogReason(l.details);
        const textDir = isAr ? 'text-right' : 'text-left';
        const flexDir = isAr ? 'justify-end' : 'justify-start';

        return `
            <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition group cursor-pointer" onclick="openAuditDetailModal(${index})">
                <!-- Timestamp -->
                <td class="px-4 py-3 whitespace-nowrap ${textDir}">
                    <div class="font-bold text-slate-700 dark:text-slate-200 text-xs">${dateStr}</div>
                    <div class="text-[11px] text-slate-400 dark:text-slate-500 font-mono flex items-center gap-1 ${flexDir} mt-0.5">
                        <i class="fa-regular fa-clock text-[10px]"></i>
                        <span>${timeStr}</span>
                    </div>
                </td>

                <!-- Actor / Admin -->
                <td class="px-4 py-3 ${textDir}">
                    <div class="flex items-center gap-2 ${flexDir}">
                        <div class="w-8 h-8 rounded-xl ${isAutoSecurity ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300' : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'} flex items-center justify-center font-bold text-xs shrink-0 shadow-xs order-${isAr ? '2' : '1'}">
                            ${isAutoSecurity ? '<i class="fa-solid fa-robot"></i>' : adminInitials}
                        </div>
                        <div class="${textDir} order-${isAr ? '1' : '2'}">
                            <div class="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5 ${flexDir}">
                                <span>${escapeHtml(l.adminName)}</span>
                                ${isAutoSecurity ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">BOT</span>' : ''}
                            </div>
                            ${l.adminEmail ? `<div class="text-[10px] text-slate-400 font-mono">${escapeHtml(l.adminEmail)}</div>` : ''}
                            ${l.adminRole && !isAutoSecurity ? `<span class="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${escapeHtml(l.adminRole)}</span>` : ''}
                        </div>
                    </div>
                </td>

                <!-- Action Type -->
                <td class="px-4 py-3 whitespace-nowrap ${textDir}">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${conf.badgeClass} shadow-xs">
                        <i class="${conf.icon} text-xs"></i>
                        <span>${escapeHtml(actionTitle)}</span>
                    </span>
                    ${isAr && conf.en !== conf.ar ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">${escapeHtml(conf.en)}</div>` : ''}
                </td>

                <!-- Target Entity (To Whom) -->
                <td class="px-4 py-3 ${textDir} min-w-[180px]">
                    <div class="font-bold text-slate-800 dark:text-slate-100 text-xs">${escapeHtml(targetTitle)}</div>
                    <div class="flex items-center gap-1.5 ${flexDir} mt-0.5">
                        <span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">${escapeHtml(cleanTargetSubtitle)}</span>
                        <span class="text-[10px] font-mono text-slate-400">#${escapeHtml(shortTargetId)}</span>
                    </div>
                </td>

                <!-- Details & Reasoning -->
                <td class="px-4 py-3 ${textDir} max-w-sm">
                    <div class="text-xs text-slate-700 dark:text-slate-200 leading-snug line-clamp-2">${escapeHtml(parsed.main || l.details)}</div>
                    ${parsed.reason ? `
                        <div class="mt-1 p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-1 ${flexDir}">
                            <i class="fa-solid fa-quote-${isAr ? 'right' : 'left'} text-amber-600 text-[10px] mt-0.5 shrink-0"></i>
                            <span class="line-clamp-2 ${textDir}"><strong class="font-bold">${isAr ? 'المبرر:' : 'Reason:'}</strong> ${escapeHtml(parsed.reason)}</span>
                        </div>
                    ` : ''}
                </td>

                <!-- Action / View Button -->
                <td class="px-3 py-3 text-center whitespace-nowrap" onclick="event.stopPropagation()">
                    <button onclick="openAuditDetailModal(${index})" title="${isAr ? 'عرض تفاصيل السجل كاملة' : 'View full audit record'}" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-indigo-600 hover:text-white dark:bg-slate-700 dark:hover:bg-indigo-600 text-slate-600 dark:text-slate-300 flex items-center justify-center transition shadow-xs mx-auto">
                        <i class="fa-solid fa-eye text-xs"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function openAuditDetailModal(index) {
    const log = currentFilteredAuditLogs[index];
    if (!log) return;
    currentSelectedAuditLog = log;
    const isAr = currentLang === 'ar';

    const conf = ADMIN_AUDIT_ACTIONS[log.action] || {
        ar: log.action,
        en: log.action,
        icon: 'fa-solid fa-circle-dot',
        badgeClass: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
    };

    const dateObj = new Date(log.timestamp);
    const dateFormatted = dateObj.toLocaleString(isAr ? 'ar-EG' : 'en-US', {
        dateStyle: 'full',
        timeStyle: 'medium'
    });

    document.getElementById('auditModalIdBadge').textContent = `#${log.id}`;
    document.getElementById('auditModalTimestamp').textContent = `${dateFormatted} (UTC: ${log.timestamp})`;

    // Admin Info
    document.getElementById('auditModalAdminName').textContent = log.adminName || 'Administrator';
    document.getElementById('auditModalAdminEmail').textContent = log.adminEmail || 'No email provided';
    document.getElementById('auditModalAdminRole').innerHTML = `<span class="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300">${escapeHtml(log.adminRole || 'Admin')}</span> <span class="font-mono text-[9px] text-slate-400">ID: ${escapeHtml(log.adminId ? log.adminId.substring(0, 10) + '...' : '')}</span>`;

    // Action Info
    document.getElementById('auditModalActionBadge').innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${conf.badgeClass}">
            <i class="${conf.icon} text-xs"></i>
            <span>${escapeHtml(isAr ? conf.ar : conf.en)}</span>
        </span>
    `;
    document.getElementById('auditModalActionRaw').textContent = `Raw Action: ${log.action}`;

    // Target Info
    let modalTargetName = log.targetName || `${log.targetEntity} #${log.targetId}`;
    let modalTargetType = log.targetType || log.targetEntity || '';
    if (!isAr) {
        if (modalTargetName.includes('نظام وضع الصيانة') || log.targetId === 'MaintenanceMode') {
            modalTargetName = 'Platform Maintenance Mode';
        } else if (modalTargetName.includes('قاعدة بيانات المنصة')) {
            modalTargetName = 'Platform Core Database';
        } else if (modalTargetName.startsWith('حجز:')) {
            modalTargetName = modalTargetName.replace('حجز:', 'Reservation:').replace('لصالح:', 'for:');
        } else if (modalTargetName.startsWith('تقييم رقم #')) {
            modalTargetName = modalTargetName.replace('تقييم رقم #', 'Review #');
        }

        const m = modalTargetType.match(/\(([^)]+)\)/);
        if (m) {
            modalTargetType = m[1];
        } else if (modalTargetType.includes('النظام')) {
            modalTargetType = 'System Core';
        } else if (modalTargetType.includes('مشرف')) {
            modalTargetType = 'Administrator';
        } else if (modalTargetType.includes('مانحة') || modalTargetType.includes('مورد')) {
            modalTargetType = 'Food Provider';
        } else if (modalTargetType.includes('جمعية')) {
            modalTargetType = 'Charity';
        } else if (modalTargetType.includes('إدراج')) {
            modalTargetType = 'Food Listing';
        } else if (modalTargetType.includes('حجز')) {
            modalTargetType = 'Reservation';
        } else if (modalTargetType.includes('تقييم')) {
            modalTargetType = 'Review';
        }
    } else {
        if (modalTargetName === 'Platform Maintenance Mode' || modalTargetName === 'Platform Maintenance System') {
            modalTargetName = 'نظام وضع الصيانة للمنصة';
        } else if (modalTargetName === 'Platform Core Database') {
            modalTargetName = 'قاعدة بيانات المنصة والنظام';
        } else if (modalTargetName.startsWith('Reservation:')) {
            modalTargetName = modalTargetName.replace('Reservation:', 'حجز:').replace('for:', 'لصالح:');
        } else if (modalTargetName.startsWith('Review #')) {
            modalTargetName = modalTargetName.replace('Review #', 'تقييم رقم #');
        }

        if (modalTargetType.includes('Food Provider') || modalTargetType === 'Provider') {
            modalTargetType = 'مزود طعام';
        } else if (modalTargetType.includes('Charity')) {
            modalTargetType = 'جمعية خيرية';
        } else if (modalTargetType.includes('Administrator') || modalTargetType === 'Admin') {
            modalTargetType = 'مشرف نظام';
        } else if (modalTargetType.includes('Food Listing')) {
            modalTargetType = 'إدراج تبرع طعام';
        } else if (modalTargetType.includes('Reservation')) {
            modalTargetType = 'حجز استلام';
        } else if (modalTargetType.includes('System Core') || modalTargetType === 'System') {
            modalTargetType = 'إعدادات النظام';
        } else if (modalTargetType.includes('Review')) {
            modalTargetType = 'تقييم جودة';
        } else if (modalTargetType.includes('User')) {
            modalTargetType = 'مستخدم';
        } else if (modalTargetType.includes(' (')) {
            modalTargetType = modalTargetType.split(' (')[0];
        }
    }

    document.getElementById('auditModalTargetName').textContent = modalTargetName;
    document.getElementById('auditModalTargetType').textContent = isAr ? `الكيان: ${modalTargetType}` : `Entity: ${modalTargetType}`;
    document.getElementById('auditModalTargetId').textContent = isAr ? `معرّف الكيان: #${log.targetId}` : `Target ID: #${log.targetId}`;

    // Reasons & Details
    const parsed = parseAuditLogReason(log.details);
    const reasonBox = document.getElementById('auditModalReasonBox');
    if (parsed.reason) {
        reasonBox.classList.remove('hidden');
        document.getElementById('auditModalReasonText').textContent = parsed.reason;
    } else {
        reasonBox.classList.add('hidden');
    }

    document.getElementById('auditModalFullDetails').textContent = log.details || (isAr ? 'لا توجد تفاصيل إضافية مسجلة.' : 'No additional details logged.');

    // Raw JSON Payload
    document.getElementById('auditModalRawJson').textContent = JSON.stringify(log, null, 2);

    document.getElementById('adminAuditDetailModal').classList.remove('hidden');
}

function closeAuditDetailModal() {
    const modal = document.getElementById('adminAuditDetailModal');
    if (modal) modal.classList.add('hidden');
    currentSelectedAuditLog = null;
}

function copyAuditModalSummary() {
    if (!currentSelectedAuditLog) return;
    const l = currentSelectedAuditLog;
    const isAr = currentLang === 'ar';
    const conf = ADMIN_AUDIT_ACTIONS[l.action];
    const actionName = conf ? (isAr ? conf.ar : conf.en) : l.action;

    const summaryText = `
[سجل تدقيق منصة FoodBridge]
- رقم السجل: #${l.id}
- التوقيت: ${new Date(l.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US')}
- منفذ الإجراء (Who): ${l.adminName} (${l.adminEmail || 'N/A'})
- نوع الإجراء (What): ${actionName} (${l.action})
- الطرف المستهدف (To Whom): ${l.targetName || l.targetEntity} (#${l.targetId})
- التفاصيل والسبب: ${l.details}
    `.trim();

    navigator.clipboard.writeText(summaryText)
        .then(() => {
            showToast(isAr ? 'تم النسخ' : 'Copied', isAr ? 'تم نسخ ملخص السجل الإداري بنجاح.' : 'Audit summary copied to clipboard.', 'success');
        })
        .catch(err => {
            console.error('Clipboard copy error:', err);
        });
}

function switchAdminTab(tab) {
    ['verifications', 'users', 'moderation', 'audit', 'waste'].forEach(t => {
        document.getElementById(`adminTab${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.add('hidden');
        document.getElementById(`atab-${t}`).className = 'pb-3 text-sm font-semibold text-slate-500 hover:text-slate-800 border-b-2 border-transparent shrink-0';
    });
    document.getElementById(`adminTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.remove('hidden');
    document.getElementById(`atab-${tab}`).className = 'pb-3 text-sm font-semibold text-indigo-600 border-b-2 border-indigo-600 shrink-0';

    if (tab === 'verifications') loadAdminVerifications();
    else if (tab === 'users') loadAdminUsers();
    else if (tab === 'moderation') loadAdminModeration();
    else if (tab === 'audit') loadAdminAuditLogs();
    else if (tab === 'waste') loadAdminExpiredListings();
}

async function loadAdminExpiredListings() {
    if (!currentUser) return;
    const isAr = currentLang === 'ar';
    const container = document.getElementById('adminExpiredListingsContainer');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE}/admin/expired-listings`, {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        const listings = await res.json();

        if (document.getElementById('adminBadgeExpiredCount')) {
            document.getElementById('adminBadgeExpiredCount').textContent = listings.length;
        }

        if (!listings || listings.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs">${isAr ? 'لا توجد تبرعات منتهية الصلاحية حالياً. جميع الفوائض تم توزيعها بنجاح!' : 'No expired surplus items currently found. All donations were redistributed on schedule!'}</div>`;
            return;
        }

        container.innerHTML = listings.map(item => `
            <div class="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:shadow-md">
                <div class="flex items-start space-x-3 rtl:space-x-reverse">
                    <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold shrink-0">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h4 class="font-bold text-slate-900 dark:white text-sm">${escapeHtml(item.foodName)}</h4>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">${escapeHtml(formatCategory(item.foodCategory))}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300">${isAr ? 'منتهي الصلاحية' : 'Expired'}</span>
                        </div>
                        <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            <span>${escapeHtml(item.providerOrganization)} (${escapeHtml(item.providerName)})</span>
                            <span class="mx-1">•</span>
                            <span class="font-bold text-amber-700 dark:text-amber-300">${item.quantity} ${escapeHtml(item.unitOfMeasurement)}</span>
                            <span class="mx-1">•</span>
                            <span>${isAr ? 'انتهت المهلة:' : 'Deadline:'} ${new Date(item.pickupDeadline).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}</span>
                        </div>
                        ${item.reportReason ? `<div class="mt-1.5 text-xs text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-800/70 p-2 rounded-lg border border-slate-200/50 dark:border-slate-700/50"><i class="fa-solid fa-info-circle text-amber-500 mr-1 rtl:ml-1"></i> ${escapeHtml(item.reportReason)}</div>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap shrink-0">
                    <button onclick="openAdminWasteActionModal(${item.id}, '${escapeHtml(item.foodName).replace(/'/g, "\\'")}', '${escapeHtml(item.providerOrganization || item.providerName).replace(/'/g, "\\'")}', ${item.quantity}, '${escapeHtml(item.unitOfMeasurement).replace(/'/g, "\\'")}')" class="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition flex items-center">
                        <i class="fa-solid fa-gavel mr-1.5 rtl:ml-1.5"></i> ${isAr ? 'اتخاذ إجراء رقابي' : 'Enforce Action'}
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error fetching expired listings:', err);
    }
}

function openAdminWasteActionModal(listingId, foodName, providerName, quantity, unit) {
    document.getElementById('wasteActionListingId').value = listingId;
    document.getElementById('wasteActionFoodName').textContent = foodName;
    document.getElementById('wasteActionProviderName').textContent = providerName;
    document.getElementById('wasteActionQuantity').textContent = `${quantity} ${unit}`;
    document.getElementById('wasteActionNotes').value = '';
    document.getElementById('wasteActionType').value = 'WarnProvider';
    document.getElementById('adminWasteActionModal').classList.remove('hidden');
}

function closeAdminWasteActionModal() {
    document.getElementById('adminWasteActionModal').classList.add('hidden');
}

async function handleWasteActionSubmit(event) {
    event.preventDefault();
    if (!currentUser) return;
    const isAr = currentLang === 'ar';
    const listingId = document.getElementById('wasteActionListingId').value;
    const actionType = document.getElementById('wasteActionType').value;
    const notes = document.getElementById('wasteActionNotes').value.trim();

    if (!listingId || !notes) return;

    const btn = document.getElementById('btnSubmitWasteAction');
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/admin/listings/${listingId}/waste-action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({ actionType, notes })
        });

        if (res.ok) {
            closeAdminWasteActionModal();
            showToast(
                isAr ? 'تم تطبيق الإجراء بنجاح' : 'Action Executed',
                isAr ? 'تم حفظ الإجراء الإداري وتوثيقه في سجل التدقيق وإشعار الجهة.' : 'Administrative action logged to audit trail and notified to provider.',
                'success'
            );
            await loadAdminStats();
            await loadAdminExpiredListings();
            await loadAdminAuditLogs();
        } else {
            const err = await res.json();
            showToast(isAr ? 'خطأ' : 'Error', err.message || (isAr ? 'تعذر تنفيذ الإجراء' : 'Failed to apply action'), 'error');
        }
    } catch (err) {
        showToast(isAr ? 'خطأ في الاتصال' : 'Connection Error', err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

