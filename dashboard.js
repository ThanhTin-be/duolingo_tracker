// ============================================================
// DUOLINGO FRIEND TRACKER — WEB DASHBOARD LOGIC
// Extracted & adapted from friend_tracker.js (Tampermonkey)
// ============================================================

// Cấu hình: Đặt true để tự động định tuyến API qua proxy node local (localhost:3000) nhằm tránh triệt để lỗi CORS.
// Đặt false nếu bạn sử dụng Extension Allow CORS của trình duyệt.
const USE_LOCAL_PROXY = true; 

function getApiUrl(url) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return url.replace('https://www.duolingo.com', 'http://localhost:3000');
    }
    // Tự động sử dụng Vercel Serverless Proxy nếu chạy trên môi trường Cloud (Vercel Production)
    return url.replace('https://www.duolingo.com', '/api/proxy?path=');
}

// ================= TEAM CONFIG =================
const TEAMS_CONFIG = {
    team1: {
        name: "Doulingo super vip",
        color: "#ff9500",
        members: ["ThanhTin72","aathw21","danieln1974","NicChantor","Alxnugget","Hihi020428","KhangElysiae","onTTrinh4","KZfzPCgH"]
    },
    team2: {
        name: "Top1Server",
        color: "#007aff",
        members: ["TaiTon_0811","Laurynnn03","BoThin990645","NgcPhngUyn11136","manh839","NguyenTran500701","AnnaTrain13","JadeH507064","TNguyn436558"]
    }
};

const US_MEMBERS = ["Alxnugget","NicChantor","JadeH507064","Laurynnn03"];

function isUsMember(u) {
    if (!u) return false;
    const n = u.toLowerCase();
    return US_MEMBERS.some(m => n.includes(m.toLowerCase())) ||
        n.includes("lauryn") || n.includes("alex nguyen") || n.includes("nic chantor") || n.includes("jade h");
}

function getUserTimezone(user) {
    if (!user) return "Asia/Ho_Chi_Minh";
    if (user.timezone) return user.timezone;
    const n = user.username || user.displayName || "";
    return isUsMember(n) ? "America/New_York" : "Asia/Ho_Chi_Minh";
}

// ================= STORAGE KEYS =================
const MONTHLY_BASE_KEY = 'DuoFriendTracker_MonthlyBase';
const HOF_KEY = 'DuoFriendTracker_HOF';
const SUMMARIZED_KEY = 'DuoFriendTracker_Summarized';
const ACCOUNTS_KEY = 'DuoDashboard_Accounts';
const ACTIVE_ACCOUNT_KEY = 'DuoDashboard_ActiveAccount';

// ================= ACCOUNT MANAGEMENT =================
function getAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || []; }
    catch { return []; }
}

function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function getActiveAccountIndex() {
    const v = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    return v !== null ? parseInt(v) : 0;
}

function setActiveAccountIndex(i) {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, String(i));
}

function getActiveAccount() {
    const accounts = getAccounts();
    const idx = getActiveAccountIndex();
    return accounts[idx] || null;
}

function addAccount(alias, jwt) {
    const userId = getUserIdFromJwt(jwt);
    if (!userId) return { error: 'JWT không hợp lệ hoặc không giải mã được!' };
    const username = getUsernameFromJwt(jwt) || 'Unknown';
    const accounts = getAccounts();
    if (accounts.some(a => a.jwt === jwt)) return { error: 'Account này đã được thêm rồi!' };
    accounts.push({ alias: alias || username, username, userId, jwt });
    saveAccounts(accounts);
    return { ok: true, index: accounts.length - 1 };
}

function removeAccount(index) {
    const accounts = getAccounts();
    accounts.splice(index, 1);
    saveAccounts(accounts);
    const active = getActiveAccountIndex();
    if (active >= accounts.length) setActiveAccountIndex(Math.max(0, accounts.length - 1));
}

// ================= JWT HELPERS =================
function getUserIdFromJwt(token) {
    if (!token) return null;
    try {
        const b64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
        return JSON.parse(decodeURIComponent(atob(b64).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''))).sub;
    } catch { return null; }
}

function getUsernameFromJwt(token) {
    if (!token) return null;
    try {
        const b64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
        const p = JSON.parse(decodeURIComponent(atob(b64).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));
        return p.username || p.name || null;
    } catch { return null; }
}

// ================= STORAGE HELPERS =================
function getMonthlyBaseXp() {
    try { return JSON.parse(localStorage.getItem(MONTHLY_BASE_KEY)) || {}; }
    catch { return {}; }
}
function saveMonthlyBaseXp(d) { localStorage.setItem(MONTHLY_BASE_KEY, JSON.stringify(d)); }

function getHofHistory() {
    let hof;
    try { hof = JSON.parse(localStorage.getItem(HOF_KEY)); } catch {}
    const defaultHof = [
        { month:"2026-04", vnWinner:{name:"Nguyễn Đức Mạnh",xp:25461}, usWinner:{name:"Lauryn",xp:18500}, teamWinner:{name:"Top1Server",xp:85460} },
        { month:"2026-03", vnWinner:{name:"Thanh Tín",xp:48885}, usWinner:{name:"Lauryn",xp:28600}, teamWinner:{name:"Top1Server",xp:161643} }
    ];
    if (!hof || hof.length === 0) { hof = defaultHof; saveHofHistory(hof); }
    return hof;
}
function saveHofHistory(h) { localStorage.setItem(HOF_KEY, JSON.stringify(h)); }

function getSummarizedMonths() {
    try { 
        const s = JSON.parse(localStorage.getItem(SUMMARIZED_KEY));
        if (!s || s.length === 0) return ["2026-03","2026-04"];
        return s;
    }
    catch { return ["2026-03","2026-04"]; }
}
function saveSummarizedMonths(m) { localStorage.setItem(SUMMARIZED_KEY, JSON.stringify(m)); }

function getCurrentMonthKey() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}

// ================= API FUNCTIONS =================
async function fetchFollowingData(userId, token) {
    const url = `https://www.duolingo.com/2017-06-30/friends/users/${userId}/following?pageSize=500&viewerId=${userId}`;
    const headers = token ? {'Authorization':`Bearer ${token}`} : {};
    try {
        const res = await fetch(getApiUrl(url), {headers});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data?.following?.users) || [];
    } catch(e) { console.error('fetchFollowing:', e); return []; }
}

async function fetchUserProfile(userId, token) {
    const url = `https://www.duolingo.com/2023-05-23/users/${userId}?fields=id,name,username,picture,totalXp,streak`;
    const headers = token ? {'Authorization':`Bearer ${token}`} : {};
    try {
        const res = await fetch(getApiUrl(url), {headers});
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

async function fetchUserProfileByUsername(username, token) {
    const url = `https://www.duolingo.com/2017-06-30/users?username=${username}`;
    const headers = token ? {'Authorization':`Bearer ${token}`} : {};
    try {
        const res = await fetch(getApiUrl(url), {headers});
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.users?.length > 0) {
            const u = data.users[0];
            return { userId:u.id, displayName:u.name||u.username, username:u.username, picture:u.picture, totalXp:u.totalXp, userScore:{score:u.streak||0}, timezone:u.timezone };
        }
        return null;
    } catch { return null; }
}

async function fetchUserStreak(userId, token) {
    if (!userId) return 0;
    const url = `https://www.duolingo.com/2023-05-23/users/${userId}?fields=streak`;
    const headers = token ? {'Authorization':`Bearer ${token}`} : {};
    try {
        const res = await fetch(getApiUrl(url), {headers});
        if (!res.ok) return 0;
        const data = await res.json();
        return typeof data.streak === 'number' ? data.streak : 0;
    } catch { return 0; }
}

function getLocalDateParts(timezone) {
    const tz = timezone || "Asia/Ho_Chi_Minh";
    try {
        const formatter = new Intl.DateTimeFormat("en-US", {timeZone:tz,year:"numeric",month:"numeric",day:"numeric"});
        const parts = formatter.formatToParts(new Date());
        const d = {};
        for (const p of parts) if (p.type !== "literal") d[p.type] = parseInt(p.value,10);
        return { year:d.year, month:d.month-1, day:d.day };
    } catch {
        const t = new Date();
        return { year:t.getFullYear(), month:t.getMonth(), day:t.getDate() };
    }
}

async function fetchUserXpBreakdown(userId, token, timezone) {
    const url = `https://www.duolingo.com/2023-05-23/users/${userId}/xp_summaries`;
    const headers = token ? {'Authorization':`Bearer ${token}`} : {};
    try {
        const res = await fetch(getApiUrl(url), {headers});
        if (!res.ok) return { today: 0, weekly: 0 };
        const data = await res.json();
        if (!data?.summaries) return { today: 0, weekly: 0 };

        const localDate = getLocalDateParts(timezone);
        
        // 1. Tính XP Hôm nay
        const todaySummary = data.summaries.find(s => {
            const d = new Date(s.date * 1000);
            return d.getUTCDate()===localDate.day && d.getUTCMonth()===localDate.month && d.getUTCFullYear()===localDate.year;
        });
        const today = todaySummary ? todaySummary.gainedXp : 0;

        // 2. Tính XP Tuần (Thứ Hai đến Chủ Nhật theo múi giờ local)
        const tz = timezone || "Asia/Ho_Chi_Minh";
        const now = new Date();
        
        const formatter = new Intl.DateTimeFormat("en-US", {timeZone:tz,year:"numeric",month:"numeric",day:"numeric"});
        const parts = formatter.formatToParts(now);
        const d = {};
        for (const p of parts) if (p.type !== "literal") d[p.type] = parseInt(p.value,10);
        const localNowDate = new Date(d.year, d.month - 1, d.day);
        
        const dayOfWeek = localNowDate.getDay(); // 0: CN, 1: T2, ..., 6: T7
        const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        
        const startOfWeek = new Date(localNowDate);
        startOfWeek.setDate(localNowDate.getDate() - daysSinceMonday);
        startOfWeek.setHours(0, 0, 0, 0);

        let weekly = 0;
        data.summaries.forEach(s => {
            const sd = new Date(s.date * 1000);
            const sdParts = formatter.formatToParts(sd);
            const sdD = {};
            for (const p of sdParts) if (p.type !== "literal") sdD[p.type] = parseInt(p.value,10);
            const sdLocalDate = new Date(sdD.year, sdD.month - 1, sdD.day);

            if (sdLocalDate >= startOfWeek && sdLocalDate <= localNowDate) {
                weekly += s.gainedXp;
            }
        });

        return { today, weekly };
    } catch(e) { 
        console.error('fetchUserXpBreakdown error:', e);
        return { today: 0, weekly: 0 }; 
    }
}

async function fetchXpLast7Days(userId, token) {
    const url = `https://www.duolingo.com/2023-05-23/users/${userId}/xp_summaries`;
    const headers = token ? {'Authorization':`Bearer ${token}`} : {};
    try {
        const res = await fetch(getApiUrl(url), {headers});
        if (!res.ok) return [];
        const data = await res.json();
        if (!data?.summaries) return [];
        const dayNames = ['CN','T2','T3','T4','T5','T6','T7'];
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate()-i);
            const s = data.summaries.find(s => {
                const sd = new Date(s.date*1000);
                return sd.getUTCDate()===d.getDate() && sd.getUTCMonth()===d.getMonth() && sd.getUTCFullYear()===d.getFullYear();
            });
            days.push({ label: i===0?'Hôm nay':dayNames[d.getDay()], xp: s?s.gainedXp:0 });
        }
        return days;
    } catch { return []; }
}


// ================= AVATAR URL =================
function buildAvatarUrl(picture) {
    if (!picture) return 'https://www.duolingo.com/images/avatars/default_1.png';
    let p = picture;
    if (p.startsWith('//')) p = 'https:' + p;
    else if (!p.startsWith('http')) p = 'https://www.duolingo.com' + p;
    if (!p.includes('/medium') && !p.includes('/large') && !p.includes('/xlarge') && p.includes('duolingo.com')) p += '/medium';
    return p;
}

// ================= COUNTDOWN =================
function getCountdownToEndOfMonth() {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59, 999);
    const diff = end - now;
    if (diff <= 0) return '🏁 Đã đến giờ chốt sổ!';
    const days = Math.floor(diff/86400000);
    const hours = Math.floor((diff%86400000)/3600000);
    const mins = Math.floor((diff%3600000)/60000);
    if (days > 0) return `⏳ Chốt sổ sau ${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `⏳ Chốt sổ sau ${hours}h ${mins}m`;
    return `🚨 Chốt sổ sau ${mins} phút!`;
}

// ================= CHỐT SỔ =================
function processChotSo(monthKey, allUsers, bases) {
    const summarized = getSummarizedMonths();
    if (summarized.includes(monthKey)) return;
    const processed = allUsers.map(u => {
        const base = bases[monthKey] && typeof bases[monthKey][u.userId]==='number' ? bases[monthKey][u.userId] : u.totalXp;
        return { name:u.displayName||u.username, username:u.username, monthlyXp: Math.max(0, u.totalXp-base) };
    });
    if (!processed.length) return;
    const usSorted = processed.filter(p=>isUsMember(p.username)).sort((a,b)=>b.monthlyXp-a.monthlyXp);
    const vnSorted = processed.filter(p=>!isUsMember(p.username)).sort((a,b)=>b.monthlyXp-a.monthlyXp);
    const usWinner = usSorted[0] || {name:"N/A",monthlyXp:0};
    const vnWinner = vnSorted[0] || {name:"N/A",monthlyXp:0};
    let t1=0,t2=0;
    processed.forEach(p=>{
        if (TEAMS_CONFIG.team1.members.includes(p.username)) t1+=p.monthlyXp;
        else if (TEAMS_CONFIG.team2.members.includes(p.username)) t2+=p.monthlyXp;
    });
    const teamWinner = t1>=t2 ? {name:TEAMS_CONFIG.team1.name,xp:t1} : {name:TEAMS_CONFIG.team2.name,xp:t2};
    const hof = getHofHistory();
    if (!hof.find(h=>h.month===monthKey)) {
        hof.unshift({month:monthKey, vnWinner:{name:vnWinner.name,xp:vnWinner.monthlyXp}, usWinner:{name:usWinner.name,xp:usWinner.monthlyXp}, teamWinner});
        saveHofHistory(hof);
    }
    summarized.push(monthKey);
    saveSummarizedMonths(summarized);
}

function checkAndChotSo(allUsers, bases) {
    const now = new Date();
    const currentMonth = getCurrentMonthKey();
    const summarized = getSummarizedMonths();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
    const isLastDay = tomorrow.getMonth() !== now.getMonth();
    const isChotTime = isLastDay && now.getHours()===23 && now.getMinutes()>=50;
    if (isChotTime && !summarized.includes(currentMonth)) {
        processChotSo(currentMonth, allUsers, bases);
        const nd = new Date(now.getFullYear(), now.getMonth()+1, 1);
        const nk = `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}`;
        if (!bases[nk]) { bases[nk]={}; allUsers.forEach(u=>{ bases[nk][u.userId]=u.totalXp; }); saveMonthlyBaseXp(bases); }
    }
    Object.keys(bases).forEach(mKey => {
        if (mKey < currentMonth && !summarized.includes(mKey)) processChotSo(mKey, allUsers, bases);
    });
}

// ================= MAIN INIT =================
async function initDashboard(onStatus, onDone) {
    const account = getActiveAccount();
    if (!account) { onStatus('Chưa có account nào. Hãy thêm JWT token.', 'error'); onDone([]); return; }

    const { jwt: token, userId } = account;
    onStatus('Đang tải danh sách bạn bè...', 'loading');

    const friends = await fetchFollowingData(userId, token);
    onStatus('Đang tải thông tin cá nhân...', 'loading');
    const me = await fetchUserProfile(userId, token);

    let allUsers = [...friends];
    if (me) {
        const meF = { userId:me.id, displayName:me.name||me.username, username:me.username, picture:me.picture, totalXp:me.totalXp, userScore:{score:me.streak}, isMe:true };
        if (!allUsers.some(u=>u.userId===meF.userId)) allUsers.push(meF);
    }

    const allTeamUsernames = [...TEAMS_CONFIG.team1.members, ...TEAMS_CONFIG.team2.members];
    const missingUsernames = allTeamUsernames.filter(uname => !allUsers.some(u=>u.username&&u.username.toLowerCase()===uname.toLowerCase()));

    if (missingUsernames.length > 0) {
        onStatus(`Đang tải bổ sung ${missingUsernames.length} thành viên...`, 'loading');
        const extra = await Promise.all(missingUsernames.map(un=>fetchUserProfileByUsername(un,token)));
        extra.forEach(u=>{ if(u) allUsers.push(u); });
    }

    const currentMonth = getCurrentMonthKey();
    const bases = getMonthlyBaseXp();
    let changed = false;
    if (!bases[currentMonth]) { bases[currentMonth]={}; changed=true; }
    allUsers.forEach(u=>{ if(typeof bases[currentMonth][u.userId]!=='number') { bases[currentMonth][u.userId]=u.totalXp; changed=true; } });
    if (changed) saveMonthlyBaseXp(bases);
    checkAndChotSo(allUsers, bases);

    onStatus(`Đang đồng bộ XP và streak (${allUsers.length} người)...`, 'loading');
    const friendsWithXp = await Promise.all(allUsers.map(async friend => {
        const tz = getUserTimezone(friend);
        const xpBreakdown = await fetchUserXpBreakdown(friend.userId, token, tz);
        const baseMonthXp = bases[currentMonth][friend.userId] || friend.totalXp;
        const monthlyXp = Math.max(0, friend.totalXp - baseMonthXp);
        let streak;
        if (typeof friend.streak === 'number') streak = friend.streak;
        else if (friend.isMe && friend.userScore) streak = friend.userScore.score || 0;
        else streak = await fetchUserStreak(friend.userId, token);
        return { 
            ...friend, 
            xpGainedToday: xpBreakdown.today, 
            weeklyXp: xpBreakdown.weekly, 
            monthlyXp, 
            timezone: tz, 
            streak 
        };
    }));

    onStatus(`✅ Tải xong ${friendsWithXp.length} thành viên`, 'success');
    onDone(friendsWithXp, token);
}

