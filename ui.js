/* ============================================================
   DUOLINGO FRIEND TRACKER — WEB DASHBOARD UI RENDERER
   Event listeners, popups, SVG charts, and interactive rendering
   ============================================================ */

// Trạng thái hiện tại của Dashboard
let currentActiveTab = 'personal';
let cachedFriendsData = [];
let cachedActiveToken = null;
let currentTimeRange = 'month';

// Cài đặt bộ lọc thời gian (Ngày, Tuần, Tháng)
function setTimeRange(range) {
    currentTimeRange = range;
    
    // Cập nhật giao diện của các nút thời gian
    ['day', 'week', 'month'].forEach(r => {
        const btn = document.getElementById(`range-btn-${r}`);
        if (btn) {
            if (r === range) {
                btn.className = "px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition duration-150 text-violet-400 bg-violet-500/10 border border-violet-500/20 shadow-neon-glow";
            } else {
                btn.className = "px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition duration-150 text-slate-400 hover:text-slate-200";
            }
        }
    });

    // Vẽ lại nội dung của Tab hiện tại theo mốc thời gian mới
    renderTabContent();
}

// Khởi chạy ứng dụng khi DOM Load
window.addEventListener('load', () => {
    // Kiểm tra và xử lý Token JWT được import tự động từ Duolingo qua Tampermonkey
    const urlParams = new URLSearchParams(window.location.search);
    const importJwt = urlParams.get('import_jwt');
    if (importJwt) {
        // Làm sạch URL ngay lập tức để tránh reload bị lặp lại hoặc lộ token
        urlParams.delete('import_jwt');
        const cleanSearch = urlParams.toString();
        const newUrl = window.location.origin + window.location.pathname + (cleanSearch ? '?' + cleanSearch : '');
        window.history.replaceState({}, document.title, newUrl);

        if (importJwt === 'not_logged_in') {
            alert('Không thể lấy Token JWT từ Duolingo. Vui lòng đăng nhập Duolingo trước trên trình duyệt rồi thử lại!');
        } else {
            // Mở modal thêm tài khoản
            toggleModal('modal-add-account', true);
            document.getElementById('acc-jwt').value = importJwt;
            
            // Điền sẵn Alias nếu tìm thấy username trong token
            const username = getUsernameFromJwt(importJwt);
            if (username) {
                document.getElementById('acc-alias').value = `Tài khoản ${username}`;
            }

            // Hiển thị thông báo thành công dạng box xanh trong modal
            const errorEl = document.getElementById('modal-add-error');
            errorEl.textContent = '🎉 Đã tự động lấy Token JWT từ Duolingo thành công! Bạn chỉ cần tùy chỉnh Tên gợi nhớ (Alias) rồi nhấn Lưu.';
            errorEl.className = "text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl";
            errorEl.classList.remove('hidden');
        }
    }

    renderAccountsList();
    startCountdownDisplay();

    // Tự động tải dữ liệu nếu đã có tài khoản được lưu trước đó
    const accounts = getAccounts();
    if (accounts.length > 0) {
        refreshDashboardData();
    } else {
        updateUIState('empty');
    }

    // Lắng nghe sự kiện Submit Form Thêm Tài Khoản
    document.getElementById('form-add-account').addEventListener('submit', async (e) => {
        e.preventDefault();
        const alias = document.getElementById('acc-alias').value.trim();
        const errorEl = document.getElementById('modal-add-error');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.innerHTML;

        errorEl.className = "hidden text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl";
        errorEl.classList.add('hidden');

        let jwt = '';

        if (currentModalTab === 'login') {
            const loginVal = document.getElementById('acc-login').value.trim();
            const passwordVal = document.getElementById('acc-password').value.trim();

            if (!loginVal || !passwordVal) {
                errorEl.textContent = 'Vui lòng điền đầy đủ tài khoản và mật khẩu!';
                errorEl.classList.remove('hidden');
                return;
            }

            // Hiển thị trạng thái đang đăng nhập
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Đang đăng nhập...';

            try {
                const response = await fetch('/api/local-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ login: loginVal, password: passwordVal })
                });

                const data = await response.json();
                
                if (!response.ok || !data.jwt) {
                    throw new Error(data.error || 'Đăng nhập thất bại! Vui lòng kiểm tra lại tài khoản.');
                }

                jwt = data.jwt;
            } catch (err) {
                errorEl.textContent = '❌ ' + err.message;
                errorEl.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
                return;
            }
        } else {
            jwt = document.getElementById('acc-jwt').value.trim();
            if (!jwt) {
                errorEl.textContent = 'Vui lòng dán mã token JWT!';
                errorEl.classList.remove('hidden');
                return;
            }
        }

        // Thực hiện thêm tài khoản với JWT thu được
        const result = addAccount(alias, jwt);
        
        // Trả lại trạng thái cho submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;

        if (result.error) {
            errorEl.textContent = result.error;
            errorEl.classList.remove('hidden');
            return;
        }

        // Reset dữ liệu input form
        document.getElementById('acc-alias').value = '';
        if (document.getElementById('acc-login')) document.getElementById('acc-login').value = '';
        if (document.getElementById('acc-password')) document.getElementById('acc-password').value = '';
        document.getElementById('acc-jwt').value = '';

        toggleModal('modal-add-account', false);
        renderAccountsList();
        setActiveAccountIndex(result.index);
        refreshDashboardData();
    });

    // Sự kiện click nút Refresh Làm Mới
    document.getElementById('btn-refresh').addEventListener('click', () => {
        refreshDashboardData();
    });
});

// Trạng thái tab hiện tại trong modal thêm tài khoản
let currentModalTab = 'login';

// Chuyển đổi tab trong modal thêm tài khoản
function switchModalTab(tabName) {
    currentModalTab = tabName;
    const tabLogin = document.getElementById('modal-tab-login');
    const tabJwt = document.getElementById('modal-tab-jwt');
    const contentLogin = document.getElementById('modal-content-login');
    const contentJwt = document.getElementById('modal-content-jwt');

    if (tabName === 'login') {
        tabLogin.className = "flex-1 pb-2 text-xs font-black uppercase tracking-wider text-violet-400 border-b-2 border-violet-500 transition duration-150";
        tabJwt.className = "flex-1 pb-2 text-xs font-black uppercase tracking-wider text-slate-400 border-b-2 border-transparent hover:text-slate-200 transition duration-150";
        contentLogin.classList.remove('hidden');
        contentJwt.classList.add('hidden');
        
        document.getElementById('acc-jwt').required = false;
        document.getElementById('acc-login').required = true;
        document.getElementById('acc-password').required = true;
    } else {
        tabLogin.className = "flex-1 pb-2 text-xs font-black uppercase tracking-wider text-slate-400 border-b-2 border-transparent hover:text-slate-200 transition duration-150";
        tabJwt.className = "flex-1 pb-2 text-xs font-black uppercase tracking-wider text-violet-400 border-b-2 border-violet-500 transition duration-150";
        contentLogin.classList.add('hidden');
        contentJwt.classList.remove('hidden');

        document.getElementById('acc-jwt').required = true;
        document.getElementById('acc-login').required = false;
        document.getElementById('acc-password').required = false;
    }
}

// Bật/Tắt hiển thị các Hộp thoại (Modal)
function toggleModal(modalId, isVisible) {
    const modal = document.getElementById(modalId);
    if (modal) {
        if (isVisible) {
            modal.classList.remove('hidden');
            
            // Nếu mở modal thêm tài khoản, reset về tab đăng nhập mặc định
            if (modalId === 'modal-add-account') {
                switchModalTab('login');
                const errorEl = document.getElementById('modal-add-error');
                if (errorEl) {
                    errorEl.className = "hidden text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl";
                    errorEl.textContent = "";
                }
                
                // Clear inputs
                document.getElementById('acc-alias').value = '';
                if (document.getElementById('acc-login')) document.getElementById('acc-login').value = '';
                if (document.getElementById('acc-password')) document.getElementById('acc-password').value = '';
                document.getElementById('acc-jwt').value = '';
            }
        } else {
            modal.classList.add('hidden');
        }
    }
}

// Chuyển đổi Tab chính (Cá nhân, Đội nhóm, Vinh danh, Dữ liệu)
function switchTab(tabName) {
    currentActiveTab = tabName;

    // Thiết lập màu sắc và trạng thái hoạt động của Tab Buttons
    ['personal', 'team', 'hof', 'data'].forEach(tab => {
        const btn = document.getElementById(`tab-btn-${tab}`);
        if (btn) {
            if (tab === tabName) {
                btn.className = "flex-1 py-3 px-4 rounded-2xl text-xs md:text-sm font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-98 bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-neon-glow";
            } else {
                btn.className = "flex-1 py-3 px-4 rounded-2xl text-xs md:text-sm font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-98 text-slate-400 hover:text-white hover:bg-white/5";
            }
        }
    });

    // Vẽ lại nội dung theo tab được chọn
    renderTabContent();
}

// Hiển thị danh sách Tài khoản trong Sidebar
function renderAccountsList() {
    const listContainer = document.getElementById('account-list');
    const accounts = getAccounts();
    const activeIdx = getActiveAccountIndex();

    document.getElementById('account-count').textContent = accounts.length;

    if (accounts.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-4 text-xs text-slate-500">Chưa có tài khoản nào được lưu</div>`;
        document.getElementById('active-account-card').classList.add('hidden');
        return;
    }

    // Hiển thị Thẻ thông tin tài khoản đang chọn
    const activeAcc = accounts[activeIdx];
    if (activeAcc) {
        document.getElementById('active-account-name').textContent = activeAcc.alias;
        document.getElementById('active-account-user').textContent = `@${activeAcc.username}`;
        document.getElementById('active-account-card').classList.remove('hidden');
    }

    listContainer.innerHTML = '';
    accounts.forEach((acc, index) => {
        const row = document.createElement('div');
        row.className = `p-3 rounded-2xl border transition flex items-center justify-between cursor-pointer gap-2 relative overflow-hidden ${index === activeIdx
            ? 'bg-gradient-to-r from-violet-600/20 to-indigo-600/20 border-violet-500/50 text-white shadow-[0_0_15px_rgba(124,58,237,0.15)]'
            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-slate-800 text-slate-300'
            }`;

        const initialBg = index === activeIdx
            ? 'bg-violet-500 text-white shadow-sm font-black'
            : 'bg-violet-600/30 text-violet-200';

        const leftPill = index === activeIdx
            ? '<div class="absolute left-0 top-3 bottom-3 w-1 bg-violet-500 rounded-r-md"></div>'
            : '';

        row.innerHTML = `
            ${leftPill}
            <div class="flex-1 min-w-0 flex items-center gap-2 pl-1.5" onclick="selectAccount(${index})">
                <div class="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${initialBg} flex-shrink-0">
                    ${acc.alias.substring(0, 1).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-extrabold text-xs truncate leading-tight ${index === activeIdx ? 'text-violet-200' : 'text-slate-200'}">${acc.alias}</div>
                    <div class="text-[10px] text-slate-500 truncate leading-none mt-0.5">@${acc.username}</div>
                </div>
            </div>
            <div class="flex items-center gap-1">
                <button class="w-6 h-6 rounded-lg hover:bg-violet-500/20 text-slate-500 hover:text-violet-400 flex items-center justify-center transition" 
                        title="Đăng nhập & mở Duolingo"
                        onclick="loginAndOpenDuolingo('${acc.jwt}', event)">
                    <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                </button>
                <button class="w-6 h-6 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 flex items-center justify-center transition" 
                        title="Xoá tài khoản"
                        onclick="deleteAccountTrigger(${index}, event)">
                    <i class="fa-solid fa-trash-can text-[10px]"></i>
                </button>
            </div>
        `;
        listContainer.appendChild(row);
    });
}

// Đăng nhập tự động & chuyển tiếp nhanh qua tab Duolingo xịn
function loginAndOpenDuolingo(token, event) {
    if (event) event.stopPropagation();
    if (!token) return;
    window.open(`https://www.duolingo.com/?auto_jwt=${encodeURIComponent(token)}`, '_blank');
}

// Lựa chọn đổi tài khoản hiện hoạt
function selectAccount(index) {
    setActiveAccountIndex(index);
    renderAccountsList();
    refreshDashboardData();
}

// Bấm nút xóa tài khoản
function deleteAccountTrigger(index, event) {
    event.stopPropagation();
    if (confirm('Bạn chắc chắn muốn xóa tài khoản này khỏi danh sách lưu trữ?')) {
        removeAccount(index);
        renderAccountsList();

        const accounts = getAccounts();
        if (accounts.length === 0) {
            updateUIState('empty');
            cachedFriendsData = [];
            renderTabContent();
        } else {
            refreshDashboardData();
        }
    }
}

// Cào và cập nhật dữ liệu Duolingo API mới nhất
function refreshDashboardData() {
    const btnRefresh = document.getElementById('btn-refresh');
    const icon = btnRefresh.querySelector('i');

    icon.className = 'fa-solid fa-arrows-rotate text-sm animate-spin-custom';
    btnRefresh.disabled = true;

    updateUIState('loading');

    initDashboard(
        // Callback cập nhật trạng thái tiến trình
        (msg, statusType) => {
            const statusEl = document.getElementById('status-bar');
            statusEl.textContent = `Trạng thái: ${msg}`;
            if (statusType === 'error') {
                statusEl.className = "px-4 py-2 rounded-xl bg-rose-950/20 border border-rose-500/20 text-xs font-medium max-w-xs truncate text-rose-400";
            } else if (statusType === 'success') {
                statusEl.className = "px-4 py-2 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-xs font-medium max-w-xs truncate text-emerald-400";
            } else {
                statusEl.className = "px-4 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-medium max-w-xs truncate text-slate-400";
            }
        },
        // Callback hoàn tất tải dữ liệu
        (friendsList, token) => {
            cachedFriendsData = friendsList;
            cachedActiveToken = token;

            icon.className = 'fa-solid fa-arrows-rotate text-sm';
            btnRefresh.disabled = false;

            if (friendsList && friendsList.length > 0) {
                updateUIState('content');
                // Nạp avatar xịn của tài khoản hiện hoạt nếu có
                const activeAcc = getActiveAccount();
                const meInfo = friendsList.find(f => f.isMe);
                if (meInfo && meInfo.picture) {
                    const avatarUrl = buildAvatarUrl(meInfo.picture);
                    document.getElementById('active-avatar-img').src = avatarUrl;
                    document.getElementById('active-avatar-img').classList.remove('hidden');
                    document.getElementById('active-avatar-placeholder').classList.add('hidden');
                }

                switchTab(currentActiveTab);
            } else {
                const accounts = getAccounts();
                if (accounts.length === 0) {
                    updateUIState('empty');
                } else {
                    updateUIState('error');
                }
            }
        }
    );
}

// Kiểm soát hiển thị các bảng trạng thái chính
function updateUIState(state) {
    const loading = document.getElementById('dashboard-loading');
    const empty = document.getElementById('dashboard-empty');
    const rangeSelector = document.getElementById('time-range-selector');

    document.getElementById('tab-content-personal').classList.add('hidden');
    document.getElementById('tab-content-team').classList.add('hidden');
    document.getElementById('tab-content-hof').classList.add('hidden');
    document.getElementById('tab-content-data').classList.add('hidden');

    loading.classList.add('hidden');
    empty.classList.add('hidden');
    if (rangeSelector) rangeSelector.classList.add('hidden');

    if (state === 'loading') {
        loading.classList.remove('hidden');
    } else if (state === 'empty') {
        empty.classList.remove('hidden');
    } else if (state === 'content') {
        // SwitchTab sẽ tự động kiểm soát việc hiển thị content sau
    } else if (state === 'error') {
        empty.classList.remove('hidden');
        const title = empty.querySelector('h3');
        title.textContent = 'Kết nối thất bại hoặc JWT hết hạn';
        const p = empty.querySelector('p');
        p.textContent = 'Chúng tôi không thể lấy dữ liệu bạn bè của tài khoản này từ Duolingo API. Token có thể đã hết hạn hoặc bị chặn CORS. Hãy thử kiểm tra lại hoặc đổi token mới.';
    }
}

// Chạy vòng lặp tính thời gian đếm ngược chốt sổ
function startCountdownDisplay() {
    const el = document.getElementById('countdown-display');
    if (el) {
        const tick = () => {
            el.textContent = getCountdownToEndOfMonth();
        };
        tick();
        setInterval(tick, 30000);
    }
}

// Điều phối hiển thị tab được chọn
function renderTabContent() {
    ['personal', 'team', 'hof', 'data'].forEach(tab => {
        const el = document.getElementById(`tab-content-${tab}`);
        if (el) el.classList.add('hidden');
    });

    const activeEl = document.getElementById(`tab-content-${currentActiveTab}`);
    if (activeEl) activeEl.classList.remove('hidden');

    // Hiển thị/ẩn bộ chọn thời gian dựa theo Tab hoạt động
    const rangeSelector = document.getElementById('time-range-selector');
    if (rangeSelector) {
        if (currentActiveTab === 'personal' || currentActiveTab === 'data') {
            rangeSelector.classList.remove('hidden');
        } else {
            rangeSelector.classList.add('hidden');
        }
    }

    if (currentActiveTab === 'hof') {
        renderHofTab();
        return;
    }

    if (cachedFriendsData.length === 0) return;

    if (currentActiveTab === 'personal') {
        renderPersonalTab();
    } else if (currentActiveTab === 'team') {
        renderTeamTab();
    } else if (currentActiveTab === 'data') {
        renderDataTabContent();
    }
}

// TAB 1: Bảng Xếp hạng Cá nhân
function renderPersonalTab() {
    const container = document.getElementById('personal-divisions-container');
    container.innerHTML = '';

    let sorted;
    if (currentTimeRange === 'day') {
        sorted = [...cachedFriendsData].sort((a, b) => (b.xpGainedToday || 0) - (a.xpGainedToday || 0));
    } else if (currentTimeRange === 'week') {
        sorted = [...cachedFriendsData].sort((a, b) => (b.weeklyXp || 0) - (a.weeklyXp || 0));
    } else {
        sorted = [...cachedFriendsData].sort((a, b) => (b.monthlyXp || 0) - (a.monthlyXp || 0));
    }

    const usFriends = sorted.filter(f => isUsMember(f.username));
    const vnFriends = sorted.filter(f => !isUsMember(f.username));

    container.appendChild(buildDivisionListCard(usFriends, true));
    container.appendChild(buildDivisionListCard(vnFriends, false));
}

function buildDivisionListCard(list, isUs) {
    const card = document.createElement('div');
    card.className = 'glass-panel rounded-3xl p-5 flex flex-col gap-4';

    const title = isUs ? 'BẢNG MỸ' : 'BẢNG VIỆT NAM';
    const prize = isUs ? '$50' : '1.000.000 VNĐ';
    const accentColor = isUs ? 'text-neonEmerald border-neonEmerald/30 bg-neonEmerald/10' : 'text-neonPurple border-neonPurple/30 bg-neonPurple/10';

    card.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 class="font-extrabold text-sm text-slate-200 tracking-wide flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full ${isUs ? 'bg-neonEmerald' : 'bg-neonPurple'}"></span>
                ${title} <span class="text-xs text-slate-500 font-bold">(${list.length} TV)</span>
            </h3>
            <span class="text-[10px] px-2.5 py-1 border rounded-full font-black uppercase tracking-wider ${accentColor}">
                🎁 ${prize}
            </span>
        </div>
        <div class="flex flex-col gap-2 overflow-y-auto max-h-[600px] pr-1" id="${isUs ? 'personal-us-list' : 'personal-vn-list'}">
            <!-- Roster lists will load here -->
        </div>
    `;

    const listContainer = card.querySelector(`#${isUs ? 'personal-us-list' : 'personal-vn-list'}`);
    if (list.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-6 text-xs text-slate-500">Chưa có thành viên nào trong bảng này.</div>`;
    } else {
        list.forEach((friend, idx) => {
            const row = document.createElement('div');
            row.className = `p-3 rounded-2xl flex items-center gap-3 cursor-pointer border transition ${friend.isMe
                ? 'bg-emerald-950/10 border-emerald-500/20 hover:bg-emerald-950/20 hover:border-emerald-500/40'
                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-violet-500/20'
                }`;

            let rankBadge = `<span class="inline-flex w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 mx-auto">${idx + 1}</span>`;
            if (idx === 0) rankBadge = `<span class="inline-flex w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[9px] font-black text-amber-500 shadow-neon-glow mx-auto"><i class="fa-solid fa-crown"></i></span>`;
            else if (idx === 1) rankBadge = `<span class="inline-flex w-5 h-5 rounded-full bg-slate-300/10 border border-slate-300/30 flex items-center justify-center text-[9px] font-black text-slate-300 mx-auto"><i class="fa-solid fa-medal"></i></span>`;
            else if (idx === 2) rankBadge = `<span class="inline-flex w-5 h-5 rounded-full bg-amber-700/10 border border-amber-700/30 flex items-center justify-center text-[9px] font-black text-amber-600 mx-auto"><i class="fa-solid fa-medal"></i></span>`;

            const avatarUrl = buildAvatarUrl(friend.picture);
            const displayName = friend.isMe ? `${friend.displayName || friend.username} (Tôi)` : (friend.displayName || friend.username);
            const streak = friend.streak || 0;
            
            let mainXpText = '';
            let subXpText = '';
            let mainXpVal = 0;

            if (currentTimeRange === 'day') {
                mainXpVal = friend.xpGainedToday || 0;
                mainXpText = `+${mainXpVal.toLocaleString()}`;
                subXpText = 'Hôm nay';
            } else if (currentTimeRange === 'week') {
                mainXpVal = friend.weeklyXp || 0;
                mainXpText = `+${mainXpVal.toLocaleString()}`;
                const todayXp = friend.xpGainedToday || 0;
                subXpText = `+${todayXp.toLocaleString()} h.nay`;
            } else {
                mainXpVal = friend.monthlyXp || 0;
                mainXpText = `+${mainXpVal.toLocaleString()}`;
                const todayXp = friend.xpGainedToday || 0;
                subXpText = `+${todayXp.toLocaleString()} h.nay`;
            }

            row.innerHTML = `
                <div class="w-7 flex-shrink-0 flex items-center justify-center">${rankBadge}</div>
                <img src="${avatarUrl}" class="w-10 h-10 rounded-full object-cover border border-violet-500/10 flex-shrink-0" onerror="this.src='https://www.duolingo.com/images/avatars/default_1.png'">
                
                <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                    <h4 class="font-bold text-xs text-slate-200 truncate">${displayName}</h4>
                    <div class="flex items-center gap-2 text-[10px] text-slate-400">
                        <span class="text-amber-500 font-extrabold flex items-center gap-0.5">
                            <i class="fa-solid fa-fire text-[10px]"></i> ${streak}
                        </span>
                        <span class="w-1 h-1 rounded-full bg-slate-700"></span>
                        <span class="font-medium truncate">${(friend.totalXp || 0).toLocaleString()} XP</span>
                    </div>
                </div>

                <div class="text-right flex-shrink-0 min-w-[70px] flex flex-col justify-center">
                    <span class="font-black text-xs ${mainXpVal > 0 ? 'text-emerald-400' : 'text-slate-500'}">
                        ${mainXpText}
                    </span>
                    <span class="text-[9px] text-slate-500 font-semibold tracking-wide mt-0.5">
                        ${subXpText}
                    </span>
                </div>
            `;

            row.addEventListener('click', () => showUserPopupTrigger(friend));
            listContainer.appendChild(row);
        });
    }

    return card;
}

// TAB 2: Đại Chiến Băng Đảng (Teams)
function renderTeamTab() {
    const container = document.getElementById('tab-content-team');
    container.innerHTML = '';

    let team1Xp = 0;
    let team2Xp = 0;
    const t1Members = [];
    const t2Members = [];

    cachedFriendsData.forEach(f => {
        if (TEAMS_CONFIG.team1.members.includes(f.username)) {
            team1Xp += f.monthlyXp;
            t1Members.push(f);
        } else if (TEAMS_CONFIG.team2.members.includes(f.username)) {
            team2Xp += f.monthlyXp;
            t2Members.push(f);
        }
    });

    t1Members.sort((a, b) => b.monthlyXp - a.monthlyXp);
    t2Members.sort((a, b) => b.monthlyXp - a.monthlyXp);

    // Tính lũy kế số tiền giải thưởng đã ăn
    const hofHistory = getHofHistory();
    let team1TotalPrize = 0;
    let team2TotalPrize = 0;
    hofHistory.forEach(w => {
        if (w.teamWinner?.name === TEAMS_CONFIG.team1.name) team1TotalPrize += 100;
        else if (w.teamWinner?.name === TEAMS_CONFIG.team2.name) team2TotalPrize += 100;
    });

    const total = team1Xp + team2Xp;
    const ratio = total === 0 ? 50 : (team1Xp / total) * 100;

    container.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div class="flex flex-col gap-1">
                <h3 class="font-extrabold text-base text-slate-200">🤝 ĐẠI CHIẾN BĂNG ĐẢNG</h3>
                <p class="text-xs text-slate-400">Cuộc so tài rực lửa giữa hai thế lực cày XP lớn nhất server.</p>
            </div>
            <div class="flex gap-4">
                <div class="text-right">
                    <span class="text-[9px] uppercase tracking-widest font-extrabold text-slate-500 block">Tổng giải thưởng</span>
                    <span class="text-xs font-black text-amber-400"><i class="fa-solid fa-trophy mr-1 text-xs"></i> 200 USD / tháng</span>
                </div>
            </div>
        </div>

        <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between text-xs font-black uppercase tracking-wide">
                <div class="flex items-center gap-2" style="color: ${TEAMS_CONFIG.team1.color}">
                    <i class="fa-solid fa-shield mr-1 text-xs"></i> ${TEAMS_CONFIG.team1.name}
                    <span class="text-[10px] px-2 py-0.5 bg-slate-900 border border-amber-500/20 text-amber-400 rounded-lg font-bold"><i class="fa-solid fa-sack-dollar mr-1"></i>$${team1TotalPrize}</span>
                </div>
                <div class="flex items-center gap-2" style="color: ${TEAMS_CONFIG.team2.color}">
                    <span class="text-[10px] px-2 py-0.5 bg-slate-900 border border-amber-500/20 text-amber-400 rounded-lg font-bold"><i class="fa-solid fa-sack-dollar mr-1"></i>$${team2TotalPrize}</span>
                    ${TEAMS_CONFIG.team2.name} <i class="fa-solid fa-shield-halved ml-1 text-xs"></i>
                </div>
            </div>
            
            <div class="h-4 bg-slate-950 border border-white/5 rounded-full overflow-hidden flex shadow-inner">
                <div class="h-full transition-all duration-700 ease-out" style="width: ${ratio}%; background-color: ${TEAMS_CONFIG.team1.color}"></div>
                <div class="h-full transition-all duration-700 ease-out" style="width: ${100 - ratio}%; background-color: ${TEAMS_CONFIG.team2.color}"></div>
            </div>

            <div class="flex items-center justify-between text-sm font-black">
                <span style="color: ${TEAMS_CONFIG.team1.color}">${team1Xp.toLocaleString()} XP</span>
                <span class="text-xs text-slate-500 font-bold uppercase tracking-widest">Tỉ lệ: ${ratio.toFixed(1)}% / ${(100 - ratio).toFixed(1)}%</span>
                <span style="color: ${TEAMS_CONFIG.team2.color}">${team2Xp.toLocaleString()} XP</span>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <div class="flex flex-col gap-2.5">
                <h4 class="font-extrabold text-xs tracking-wider uppercase border-b border-slate-800 pb-2 flex items-center gap-1.5" style="color: ${TEAMS_CONFIG.team1.color}">
                    <i class="fa-solid fa-shield text-[10px]"></i> THÀNH VIÊN ${TEAMS_CONFIG.team1.name} (${t1Members.length} TV)
                </h4>
                <div class="flex flex-col gap-1.5" id="team-roster-1"></div>
            </div>

            <div class="flex flex-col gap-2.5">
                <h4 class="font-extrabold text-xs tracking-wider uppercase border-b border-slate-800 pb-2 flex items-center gap-1.5" style="color: ${TEAMS_CONFIG.team2.color}">
                    <i class="fa-solid fa-shield-halved text-[10px]"></i> THÀNH VIÊN ${TEAMS_CONFIG.team2.name} (${t2Members.length} TV)
                </h4>
                <div class="flex flex-col gap-1.5" id="team-roster-2"></div>
            </div>
        </div>
    `;

    const roster1 = container.querySelector('#team-roster-1');
    const roster2 = container.querySelector('#team-roster-2');

    const buildRosterRows = (list, rosterEl) => {
        if (list.length === 0) {
            rosterEl.innerHTML = `<div class="text-xs text-slate-500 py-3">Không có thành viên tham gia trong danh sách.</div>`;
            return;
        }
        list.forEach(m => {
            const row = document.createElement('div');
            row.className = "flex items-center justify-between p-2.5 bg-white/5 border border-white/5 hover:border-slate-800 rounded-xl transition text-xs cursor-pointer";
            const isLeader = m.username === 'ThanhTin72' || m.username === 'TaiTon_0811';
            const leaderStar = isLeader ? '<i class="fa-solid fa-star text-amber-500 text-[10px] animate-pulse mr-1"></i>' : '';
            row.innerHTML = `
                <span class="font-bold flex items-center gap-1.5 truncate ${m.isMe ? 'text-emerald-400' : 'text-slate-200'}">
                    ${leaderStar}${m.displayName || m.username}
                </span>
                <span class="font-black text-slate-300">
                    +${(m.monthlyXp || 0).toLocaleString()} XP
                </span>
            `;
            row.addEventListener('click', () => showUserPopupTrigger(m));
            rosterEl.appendChild(row);
        });
    };

    buildRosterRows(t1Members, roster1);
    buildRosterRows(t2Members, roster2);
}

// TAB 3: Bảng Vinh Danh (Hall of Fame)
function renderHofTab() {
    const container = document.getElementById('tab-content-hof');
    container.innerHTML = '';

    const hof = getHofHistory();

    if (hof.length === 0) {
        container.innerHTML = `
            <div class="glass-panel rounded-3xl p-10 text-center flex flex-col items-center gap-3">
                <i class="fa-solid fa-award text-4xl text-amber-400 mb-1"></i>
                <h3 class="font-extrabold text-sm text-slate-300 uppercase tracking-widest">Chưa có bảng lịch sử</h3>
                <p class="text-xs text-slate-500 max-w-xs">Đại chiến của các cày thủ trong tháng này đang nổ ra kịch tính. Bảng vinh danh sẽ xuất hiện sau khi chốt sổ.</p>
            </div>
        `;
        return;
    }

    hof.forEach(item => {
        const card = document.createElement('div');
        card.className = "glass-panel rounded-3xl p-5 flex flex-col gap-4 border border-violet-500/10";

        card.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 class="font-extrabold text-sm text-amber-400 tracking-wide flex items-center gap-2">
                    <i class="fa-solid fa-award"></i> Tháng ${item.month}
                </h3>
                <span class="text-[9px] px-2.5 py-1 bg-slate-900 border border-emerald-500/20 text-emerald-400 rounded-full font-black uppercase tracking-wider flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ĐÃ CHỐT SỔ
                </span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                
                <div class="p-3 bg-white/5 border border-white/5 rounded-2xl flex flex-col gap-1.5">
                    <span class="text-[10px] text-slate-500 uppercase font-bold tracking-wider"><i class="fa-solid fa-circle-check text-violet-400 mr-1 text-[9px]"></i> Vô địch Việt Nam</span>
                    <span class="font-black text-violet-300">${item.vnWinner?.name || 'N/A'}</span>
                    <div class="flex justify-between items-center text-[10px] mt-1 border-t border-slate-900 pt-1.5 text-slate-400 font-semibold">
                        <span>+${(item.vnWinner?.xp || 0).toLocaleString()} XP</span>
                        <span class="text-amber-500"><i class="fa-solid fa-gift mr-1 text-[9px]"></i> 1.000.000 VNĐ</span>
                    </div>
                </div>

                <div class="p-3 bg-white/5 border border-white/5 rounded-2xl flex flex-col gap-1.5">
                    <span class="text-[10px] text-slate-500 uppercase font-bold tracking-wider"><i class="fa-solid fa-circle-check text-emerald-400 mr-1 text-[9px]"></i> Vô địch Mỹ</span>
                    <span class="font-black text-emerald-300">${item.usWinner?.name || 'N/A'}</span>
                    <div class="flex justify-between items-center text-[10px] mt-1 border-t border-slate-900 pt-1.5 text-slate-400 font-semibold">
                        <span>+${(item.usWinner?.xp || 0).toLocaleString()} XP</span>
                        <span class="text-emerald-400"><i class="fa-solid fa-gift mr-1 text-[9px]"></i> $50 USD</span>
                    </div>
                </div>

                <div class="p-3 bg-white/5 border border-white/5 rounded-2xl flex flex-col gap-1.5">
                    <span class="text-[10px] text-slate-500 uppercase font-bold tracking-wider"><i class="fa-solid fa-users text-cyan-400 mr-1 text-[9px]"></i> Đội chiến thắng</span>
                    <span class="font-black text-cyan-300">${item.teamWinner?.name || 'N/A'}</span>
                    <div class="flex justify-between items-center text-[10px] mt-1 border-t border-slate-900 pt-1.5 text-slate-400 font-semibold">
                        <span>+${(item.teamWinner?.xp || 0).toLocaleString()} XP</span>
                        <span class="text-cyan-400"><i class="fa-solid fa-gift mr-1 text-[9px]"></i> $100 USD</span>
                    </div>
                </div>

            </div>
        `;
        container.appendChild(card);
    });
}

// TAB 4: Bảng dữ liệu Grid đầy đủ
function renderDataTabContent() {
    const container = document.getElementById('tab-content-data');
    container.innerHTML = '';

    let sorted;
    if (currentTimeRange === 'day') {
        sorted = [...cachedFriendsData].sort((a, b) => (b.xpGainedToday || 0) - (a.xpGainedToday || 0));
    } else if (currentTimeRange === 'week') {
        sorted = [...cachedFriendsData].sort((a, b) => (b.weeklyXp || 0) - (a.weeklyXp || 0));
    } else {
        sorted = [...cachedFriendsData].sort((a, b) => (b.monthlyXp || 0) - (a.monthlyXp || 0));
    }

    const monthHeader = getCurrentMonthKey();

    const card = document.createElement('div');
    card.className = "glass-panel rounded-3xl p-5 flex flex-col gap-4 overflow-hidden";

    let rowsHtml = sorted.map((f, idx) => {
        const avatar = buildAvatarUrl(f.picture);
        const displayName = f.isMe ? `${f.displayName || f.username} (Tôi)` : (f.displayName || f.username);
        const monthly = f.monthlyXp || 0;
        const weekly = f.weeklyXp || 0;
        const today = f.xpGainedToday || 0;
        const total = f.totalXp || 0;
        const streak = f.streak || 0;

        let teamSpan = '';
        if (TEAMS_CONFIG.team1.members.includes(f.username)) {
            teamSpan = `<span class="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black rounded-lg">${TEAMS_CONFIG.team1.name}</span>`;
        } else if (TEAMS_CONFIG.team2.members.includes(f.username)) {
            teamSpan = `<span class="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-black rounded-lg">${TEAMS_CONFIG.team2.name}</span>`;
        }

        let medal = `<span class="inline-flex w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 mx-auto">${idx + 1}</span>`;
        if (idx === 0) medal = `<span class="inline-flex w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[9px] font-black text-amber-500 shadow-neon-glow mx-auto"><i class="fa-solid fa-crown"></i></span>`;
        else if (idx === 1) medal = `<span class="inline-flex w-5 h-5 rounded-full bg-slate-300/10 border border-slate-300/30 flex items-center justify-center text-[9px] font-black text-slate-300 mx-auto"><i class="fa-solid fa-medal"></i></span>`;
        else if (idx === 2) medal = `<span class="inline-flex w-5 h-5 rounded-full bg-amber-700/10 border border-amber-700/30 flex items-center justify-center text-[9px] font-black text-amber-600 mx-auto"><i class="fa-solid fa-medal"></i></span>`;

        const monthlyClass = currentTimeRange === 'month' ? 'text-emerald-400 font-black' : 'text-slate-300 font-semibold';
        const weeklyClass = currentTimeRange === 'week' ? 'text-emerald-400 font-black' : 'text-slate-300 font-semibold';
        const todayClass = currentTimeRange === 'day' ? 'text-emerald-400 font-black' : 'text-slate-300 font-semibold';

        return `
            <tr class="border-b border-slate-900/60 hover:bg-white/5 transition duration-150 cursor-pointer" onclick="showPopupFromDataRow('${f.username}')">
                <td class="px-4 py-3.5"><div class="flex items-center justify-center">${medal}</div></td>
                <td class="px-4 py-3.5 flex items-center gap-2.5 min-w-0">
                    <img src="${avatar}" class="w-8 h-8 rounded-full object-cover border border-violet-500/10" onerror="this.src='https://www.duolingo.com/images/avatars/default_1.png'">
                    <div class="flex flex-col min-w-0">
                        <span class="font-extrabold text-xs text-slate-200 truncate ${f.isMe ? 'text-emerald-400' : ''}">${displayName}</span>
                        <span class="text-[10px] text-slate-500 font-semibold truncate mt-0.5">@${f.username}</span>
                    </div>
                </td>
                <td class="px-4 py-3.5 text-center">${teamSpan}</td>
                <td class="px-4 py-3.5 text-right text-xs ${monthlyClass}">+${monthly.toLocaleString()}</td>
                <td class="px-4 py-3.5 text-right text-xs ${weeklyClass}">+${weekly.toLocaleString()}</td>
                <td class="px-4 py-3.5 text-right text-xs ${todayClass}">+${today.toLocaleString()}</td>
                <td class="px-4 py-3.5 text-center font-black text-xs text-amber-500"><i class="fa-solid fa-fire text-[10px] mr-0.5"></i> ${streak}</td>
                <td class="px-4 py-3.5 text-right text-xs text-slate-400 font-semibold">${total.toLocaleString()} XP</td>
            </tr>
        `;
    }).join('');

    card.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <h3 class="font-extrabold text-sm text-slate-200 tracking-wide">
                📊 BẢNG DỮ LIỆU ĐUA TOP (THÁNG ${monthHeader})
            </h3>
            
            <div class="flex gap-2">
                <button onclick="exportDataBackup()" class="px-3.5 py-2 rounded-xl bg-white/5 border border-white/5 hover:border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold transition flex items-center gap-1.5">
                    <i class="fa-solid fa-download"></i> Backup Data
                </button>
                <button onclick="importDataBackupTrigger()" class="px-3.5 py-2 rounded-xl bg-white/5 border border-white/5 hover:border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-bold transition flex items-center gap-1.5">
                    <i class="fa-solid fa-upload"></i> Restore Data
                </button>
                <input type="file" id="file-import" class="hidden" accept=".json" onchange="handleImportFile(event)">
            </div>
        </div>

        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-white/5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-800">
                        <th class="p-4 text-center w-12">#</th>
                        <th class="p-4">Cày thủ</th>
                        <th class="p-4 text-center">Băng đảng</th>
                        <th class="p-4 text-right">XP Tháng</th>
                        <th class="p-4 text-right">XP Tuần</th>
                        <th class="p-4 text-right">XP Hôm nay</th>
                        <th class="p-4 text-center">Streak</th>
                        <th class="p-4 text-right">Tích lũy</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-900/40 text-xs leading-normal">
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
    container.appendChild(card);
}

// Bật Popup hiển thị Biểu đồ Tăng trưởng 7 ngày (SVG Chart)
async function showUserPopupTrigger(friend) {
    toggleModal('modal-user-stats', true);

    document.getElementById('popup-avatar').src = buildAvatarUrl(friend.picture);
    const displayName = friend.isMe ? `${friend.displayName || friend.username} (Tôi)` : (friend.displayName || friend.username);
    document.getElementById('popup-name').textContent = displayName;
    document.getElementById('popup-username').textContent = `@${friend.username}`;
    document.getElementById('popup-streak').textContent = friend.streak || 0;
    document.getElementById('popup-monthly').textContent = (friend.monthlyXp || 0).toLocaleString();
    document.getElementById('popup-today').textContent = (friend.xpGainedToday || 0).toLocaleString();
    document.getElementById('popup-total').textContent = (friend.totalXp || 0).toLocaleString();

    const barContainer = document.getElementById('popup-chart-bars');
    barContainer.innerHTML = `<div class="text-xs text-slate-500 font-semibold w-full text-center py-8">Đang tải lịch sử cày...</div>`;
    document.getElementById('popup-week-total').textContent = '...';

    // Gọi API lấy lịch sử cày 7 ngày
    const token = cachedActiveToken;
    const days7 = await fetchXpLast7Days(friend.userId, token);

    if (days7.length === 0) {
        barContainer.innerHTML = `<div class="text-xs text-slate-500 font-semibold w-full text-center py-8">Không có dữ liệu 7 ngày.</div>`;
        document.getElementById('popup-week-total').textContent = '0 XP';
        return;
    }

    const maxXp = Math.max(...days7.map(d => d.xp), 1);
    const totalWeek = days7.reduce((s, d) => s + d.xp, 0);

    document.getElementById('popup-week-total').textContent = `${totalWeek.toLocaleString()} XP`;
    
    // Vẽ Biểu Đồ Tăng Trưởng Neon Đích Thực (Advanced Profile SVG Chart)
    const width = 320;
    const height = 110;
    const paddingLeft = 15;
    const paddingRight = 15;
    const paddingTop = 22;
    const paddingBottom = 15;
    
    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;
    
    const step = chartW / 6;
    
    let svgHtml = `
        <svg viewBox="0 0 ${width} ${height}" class="w-full h-full text-slate-400 select-none">
            <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#10b981" stop-opacity="0.75" />
                    <stop offset="100%" stop-color="#10b981" stop-opacity="0.05" />
                </linearGradient>
                <linearGradient id="barGradToday" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.85" />
                    <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.1" />
                </linearGradient>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#10b981" stop-opacity="0.2" />
                    <stop offset="50%" stop-color="#8b5cf6" stop-opacity="0.3" />
                    <stop offset="100%" stop-color="#10b981" stop-opacity="0.2" />
                </linearGradient>
            </defs>
    `;
    
    // Vẽ các đường kẻ ngang chấm chấm (Gridlines)
    const gridLines = 3;
    for (let i = 0; i < gridLines; i++) {
        const y = paddingTop + (chartH / (gridLines - 1)) * i;
        svgHtml += `
            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" 
                  stroke="rgba(255,255,255,0.03)" stroke-dasharray="3,3" stroke-width="1" />
        `;
    }

    // Vẽ đường cong mềm đại diện cho xu hướng tăng trưởng
    let pathD = '';
    let areaD = '';
    days7.forEach((d, idx) => {
        const x = paddingLeft + idx * step;
        const ratio = d.xp / maxXp;
        const y = paddingTop + chartH * (1 - ratio);
        if (idx === 0) {
            pathD = `M ${x} ${y}`;
            areaD = `M ${x} ${paddingTop + chartH} L ${x} ${y}`;
        } else {
            pathD += ` L ${x} ${y}`;
            areaD += ` L ${x} ${y}`;
        }
        if (idx === days7.length - 1) {
            areaD += ` L ${x} ${paddingTop + chartH} Z`;
        }
    });
    
    svgHtml += `
        <path d="${areaD}" fill="url(#lineGrad)" opacity="0.12" />
        <path d="${pathD}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
    `;
    
    // Vẽ các cột đứng có tương tác động và nhãn điểm
    days7.forEach((d, idx) => {
        const isToday = idx === days7.length - 1;
        const x = paddingLeft + idx * step;
        const ratio = d.xp / maxXp;
        const y = paddingTop + chartH * (1 - ratio);
        const barH = chartH * ratio;
        const barW = 18;
        
        const fill = isToday ? 'url(#barGradToday)' : d.xp > 0 ? 'url(#barGrad)' : 'rgba(255,255,255,0.03)';
        const stroke = isToday ? '#8b5cf6' : d.xp > 0 ? '#10b981' : 'transparent';
        const strokeWidth = d.xp > 0 ? 1 : 0;
        
        svgHtml += `
            <g class="cursor-pointer group">
                <!-- Vùng đệm bắt sự kiện hover dễ trúng -->
                <rect x="${x - barW/2 - 2}" y="${paddingTop - 10}" width="${barW + 4}" height="${chartH + 20}" 
                      fill="transparent" class="hover:fill-white/5 transition-all duration-150" />
                
                <!-- Cột dữ liệu chính -->
                <rect x="${x - barW/2}" y="${y}" width="${barW}" height="${Math.max(barH, d.xp > 0 ? 4 : 0)}" 
                      rx="3" ry="3" fill="${fill}" stroke="${stroke}" stroke-opacity="0.35" stroke-width="${strokeWidth}" 
                      class="transition-all duration-300 ease-out" />
                      
                <!-- Điểm tròn đỉnh cột -->
                ${d.xp > 0 ? `<circle cx="${x}" cy="${y}" r="1.5" fill="${isToday ? '#8b5cf6' : '#10b981'}" />` : ''}
                
                <!-- Điểm XP hiện lên khi hover chuột -->
                <text x="${x}" y="${y - 6}" text-anchor="middle" font-size="8" font-weight="900" 
                      fill="${isToday ? '#c084fc' : d.xp > 0 ? '#34d399' : '#64748b'}" 
                      class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                    ${d.xp}
                </text>
                
                <!-- Nhãn Thứ -->
                <text x="${x}" y="${height - 2}" text-anchor="middle" font-size="8" font-weight="700" 
                      fill="${isToday ? '#c084fc' : '#64748b'}">
                    ${d.label}
                </text>
            </g>
        `;
    });
    
    svgHtml += `</svg>`;
    barContainer.innerHTML = svgHtml;
}

// Tìm và mở stats popup từ hàng click trong Table Grid
function showPopupFromDataRow(username) {
    const friend = cachedFriendsData.find(f => f.username === username);
    if (friend) showUserPopupTrigger(friend);
}

// Xuất file sao lưu dữ liệu (.json)
function exportDataBackup() {
    const data = {
        monthlyBase: getMonthlyBaseXp(),
        hof: getHofHistory(),
        summarized: getSummarizedMonths()
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `DuoFriendTracker_Backup_${getCurrentMonthKey()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// Bấm nút mở file import dữ liệu
function importDataBackupTrigger() {
    document.getElementById('file-import').click();
}

function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (parsed.monthlyBase) {
                saveMonthlyBaseXp(parsed.monthlyBase);
            }
            if (parsed.hof) {
                saveHofHistory(parsed.hof);
            }
            if (parsed.summarized) {
                saveSummarizedMonths(parsed.summarized);
            }

            alert('Khôi phục dữ liệu sao lưu thành công!');
            refreshDashboardData();
        } catch (err) {
            alert('Lỗi! File khôi phục không đúng cấu trúc JSON tiêu chuẩn.');
        }
    };
    reader.readAsText(file);
}
