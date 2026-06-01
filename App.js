console.log('App.js loaded');
const tg = (typeof window !== 'undefined' && window.Telegram?.WebApp) ? window.Telegram.WebApp : null;
console.log('Telegram available:', !!tg);
let user = null, role = null, userId = null;

async function loadUser() {
    console.log('loadUser()');
    const stored = localStorage.getItem('akm_user');
    if (stored) {
        user = JSON.parse(stored);
        role = user.user_type;
        userId = user.telegram_id;
        console.log('User loaded:', role);
        updateUI();
        return;
    }
    let uid = new URLSearchParams(location.search).get('uid');
    if (!uid && tg?.initDataUnsafe?.user?.id) uid = tg.initDataUnsafe.user.id;
    if (uid) {
        try {
            const res = await fetch(`/api/users/${uid}`);
            if (res.ok) {
                user = await res.json();
                role = user.user_type;
                userId = user.telegram_id;
                localStorage.setItem('akm_user', JSON.stringify(user));
                updateUI();
            }
        } catch(e) { console.error(e); }
    }
}

function updateUI() {
    console.log('updateUI for:', location.pathname);
    if (location.pathname.includes('dashboard')) loadDashboard();
    else if (location.pathname.includes('marketplace')) loadMarketplace();
    else if (location.pathname.includes('campaigns')) loadCampaigns();
    else if (location.pathname.includes('wallet')) loadWallet();
}

async function loadDashboard() {
    if (!user) return;
    const kpiGrid = document.getElementById('kpiGrid');
    if (!kpiGrid) return;
    try {
        const campaigns = await (await fetch(`/api/campaigns/advertiser/${user.id}`)).json();
        const orders = await (await fetch(`/api/orders/${user.id}`)).json();
        const totalSpent = (campaigns || []).reduce((s, c) => s + (c.budget || 0), 0);
        kpiGrid.innerHTML = `
            <div class="kpi-card"><div>Balance</div><div class="kpi-value">$${(user.balance || 0).toFixed(2)}</div></div>
            <div class="kpi-card"><div>Active Campaigns</div><div class="kpi-value">${(campaigns || []).filter(c => c.is_active).length}</div></div>
            <div class="kpi-card"><div>Total Spent</div><div class="kpi-value">$${totalSpent.toFixed(2)}</div></div>
            <div class="kpi-card"><div>Pending Orders</div><div class="kpi-value">${(orders || []).filter(o => o.status === 'pending').length}</div></div>`;
    } catch(e) { console.error(e); }
}

async function loadMarketplace() {
    const grid = document.getElementById('channelsGrid');
    if (!grid) return;
    try {
        const channels = await (await fetch('/api/channels')).json();
        if (!channels || channels.length === 0) {
            grid.innerHTML = '<div class="channel-card">No channels available</div>';
            return;
        }
        grid.innerHTML = channels.map(c => `
            <div class="channel-card">
                <div class="channel-header"><strong>${c.title}</strong><span class="channel-category">${c.category}</span></div>
                <div>👥 ${(c.subscribers || 0).toLocaleString()} subs</div>
                <div class="channel-price">$${c.price_per_post}</div>
                ${role === 'advertiser' ? `<button class="btn" onclick="bookChannel(${c.id}, ${c.price_per_post})" style="width:100%">Book</button>` : ''}
            </div>
        `).join('');
    } catch(e) { grid.innerHTML = '<div class="channel-card">Error loading channels</div>'; }
}

async function loadCampaigns() {
    const container = document.getElementById('campaignsList');
    if (!container) return;
    if (role !== 'advertiser') {
        container.innerHTML = '<div class="campaign-card">Advertisers only</div>';
        return;
    }
    try {
        const campaigns = await (await fetch(`/api/campaigns/advertiser/${user.id}`)).json();
        if (!campaigns || campaigns.length === 0) {
            container.innerHTML = '<div class="campaign-card">No campaigns yet</div>';
            return;
        }
        let html = '';
        for (const c of campaigns) {
            const orders = await (await fetch(`/api/orders/campaign/${c.id}`)).json();
            const completed = (orders || []).filter(o => o.status === 'released').length;
            const progress = orders.length ? (completed / orders.length) * 100 : 0;
            html += `<div class="campaign-card"><strong>${c.title}</strong> - $${c.budget}<br>Progress: ${Math.round(progress)}%<br><button class="btn-secondary" onclick="viewOrders(${c.id})">View Orders</button></div>`;
        }
        container.innerHTML = html;
    } catch(e) { console.error(e); }
}

async function loadWallet() {
    const balanceEl = document.getElementById('balanceAmount');
    const ordersList = document.getElementById('ordersList');
    if (balanceEl) balanceEl.innerHTML = `$${(user.balance || 0).toFixed(2)}`;
    if (!ordersList) return;
    try {
        const orders = await (await fetch(`/api/orders/${user.id}`)).json();
        const active = (orders || []).filter(o => o.status !== 'released');
        if (active.length === 0) {
            ordersList.innerHTML = '<div class="order-card">No active orders</div>';
            return;
        }
        ordersList.innerHTML = active.map(o => `
            <div class="order-card">
                <div><strong>Order #${o.id}</strong> - $${o.amount}</div>
                <div>Status: ${o.status}</div>
                ${o.status === 'pending' ? `<button class="btn-secondary" onclick="lockOrder(${o.id})">Lock Payment</button>` : ''}
                ${o.status === 'locked' ? `<button class="btn-secondary" onclick="releaseOrder(${o.id})">Release</button>` : ''}
            </div>
        `).join('');
    } catch(e) { console.error(e); }
}

async function bookChannel(id, price) {
    if (confirm(`Book for $${price}?`)) {
        await fetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ advertiser_id: user.id, title: 'Direct Booking', description: '', category: 'General', budget: price, price_per_post: price, target_subscribers_min: 0 })
        });
        alert('Booked!');
    }
}

async function lockOrder(id) {
    try {
        await fetch(`/api/orders/${id}/lock`, { method: 'POST' });
        alert('Payment locked!');
        loadWallet();
        loadDashboard();
    } catch(e) { alert('Insufficient balance'); }
}

async function releaseOrder(id) {
    await fetch(`/api/orders/${id}/confirm-post`, { method: 'POST' });
    await fetch(`/api/orders/${id}/release`, { method: 'POST' });
    alert('Released!');
    loadWallet();
    loadDashboard();
}

async function addFunds() {
    const amount = prompt('Amount ($10-1000):', '100');
    if (amount && amount >= 10 && amount <= 1000) {
        const res = await fetch(`/api/users/${userId}/add-funds?amount=${amount}`, { method: 'POST' });
        const data = await res.json();
        user.balance = data.new_balance;
        localStorage.setItem('akm_user', JSON.stringify(user));
        loadWallet();
        loadDashboard();
        alert(`Added $${amount}`);
    }
}

function showCreateModal() {
    document.getElementById('campaignModal')?.classList.add('active');
}

async function createCampaign(e) {
    e.preventDefault();
    const data = {
        advertiser_id: user.id,
        title: document.getElementById('title').value,
        description: document.getElementById('desc').value,
        category: document.getElementById('cat').value,
        budget: parseFloat(document.getElementById('budget').value),
        price_per_post: parseFloat(document.getElementById('price').value),
        target_subscribers_min: parseInt(document.getElementById('minSubs').value) || 0
    };
    if (data.budget < 50) { alert('Min $50'); return; }
    await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    alert('Campaign created!');
    document.getElementById('campaignModal')?.classList.remove('active');
    if (location.pathname.includes('campaigns')) loadCampaigns();
}

async function viewOrders(cid) {
    const orders = await (await fetch(`/api/orders/campaign/${cid}`)).json();
    alert(orders.map(o => `#${o.id}: $${o.amount} - ${o.status}`).join('\n'));
}

document.addEventListener('DOMContentLoaded', () => {
    loadUser();
    document.getElementById('createBtn')?.addEventListener('click', showCreateModal);
    document.getElementById('campaignForm')?.addEventListener('submit', createCampaign);
    document.getElementById('addFundsBtn')?.addEventListener('click', addFunds);
    document.getElementById('cancelModal')?.addEventListener('click', () => document.getElementById('campaignModal')?.classList.remove('active'));
});

async function selectRole(role) {
    let uid = new URLSearchParams(location.search).get('uid');
    if (!uid && tg?.initDataUnsafe?.user?.id) uid = tg.initDataUnsafe.user.id;
    if (!uid) { alert('No user ID'); return; }
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id: parseInt(uid), username: 'user', user_type: role }) });
    user = await res.json();
    localStorage.setItem('akm_user', JSON.stringify(user));
    window.location.href = '/dashboard.html';
}