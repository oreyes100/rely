// --- DATA STORE ---
let users = [
    { id: 1, name: 'Abner', role: 'administrador', pin: '1234' },
    { id: 2, name: 'Marta', role: 'cajera', pin: '4321' },
    { id: 3, name: 'Luis', role: 'mesero', pin: '1111' },
    { id: 4, name: 'Pedro', role: 'cocinero', pin: '1234' }
];

const FILLINGS = ['Picadillo', 'Pollo', 'Deshebrada', 'Papa', 'Frijol'];

let products = [
    // BEBIDAS
    { id: 101, name: 'Atole (Taza)', price: 20.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 102, name: 'Atole (1/2 Lt)', price: 25.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 103, name: 'Atole (1 Lt)', price: 50.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 104, name: 'Coca Cola 600ml', price: 30.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 105, name: 'Coca Cola 400ml', price: 25.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 106, name: 'Coca Cola 355ml', price: 25.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 107, name: 'Squirt 600ml', price: 30.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 108, name: 'Squirt 400ml', price: 25.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 109, name: 'Squirt 355ml', price: 25.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 110, name: 'Sprite 600ml', price: 30.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 111, name: 'Sprite 400ml', price: 25.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 112, name: 'Sprite 355ml', price: 25.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 113, name: 'Fanta 600ml', price: 30.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 114, name: 'Fanta 400ml', price: 25.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 115, name: 'Fanta 355ml', price: 25.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 116, name: 'Agua Fresca Horchata (1/2 Lt)', price: 20.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 117, name: 'Agua Fresca Horchata (1 Lt)', price: 30.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 118, name: 'Agua Fresca Chía (1/2 Lt)', price: 20.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 119, name: 'Agua Fresca Chía (1 Lt)', price: 30.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 120, name: 'Agua Fresca Jamaica (1/2 Lt)', price: 20.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 121, name: 'Agua Fresca Jamaica (1 Lt)', price: 30.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 122, name: 'Cerveza', price: 25.00, category: 'BEBIDAS', image: null, modifiers: [] },
    { id: 123, name: 'Agua Natural', price: 15.00, category: 'BEBIDAS', image: null, modifiers: [] },

    // TAMALES
    { id: 201, name: 'Tamal', price: 35.00, category: 'TAMALES', image: null, modifiers: [ { name: 'Sabor', type: 'radio', choices: ['Rojo', 'Verde', 'Dulce'] } ] },    // ENCHILADAS
    { id: 301, name: 'Enchiladas (Orden 3pz)', price: 60.00, category: 'ENCHILADAS', pieces: 3, image: null, modifiers: [ { name: 'Relleno', type: 'radio', choices: FILLINGS }, { name: 'Complementos', type: 'checkbox', choices: ['Crema', 'Queso', 'Salsa'] } ] },
    { id: 302, name: 'Enchilada (1pz)', price: 20.00, category: 'ENCHILADAS', pieces: 1, image: null, modifiers: [ { name: 'Relleno', type: 'radio', choices: FILLINGS }, { name: 'Complementos', type: 'checkbox', choices: ['Crema', 'Queso', 'Salsa'] } ] },

    // SOPES
    { id: 401, name: 'Sopes (Orden 3pz)', price: 70.00, category: 'SOPES', pieces: 3, image: null, modifiers: [ { name: 'Relleno', type: 'radio', choices: FILLINGS } ] },
    { id: 402, name: 'Sope (1pz)', price: 25.00, category: 'SOPES', pieces: 1, image: null, modifiers: [ { name: 'Relleno', type: 'radio', choices: FILLINGS } ] },

    // TACOS DORADOS
    { id: 501, name: 'Tacos Dorados (Orden 5pz)', price: 60.00, category: 'TACOS', pieces: 5, image: null, modifiers: [ { name: 'Relleno', type: 'radio', choices: FILLINGS } ] },
    { id: 502, name: 'Tacos Dorados (1/2 Orden 3pz)', price: 45.00, category: 'TACOS', pieces: 3, image: null, modifiers: [ { name: 'Relleno', type: 'radio', choices: FILLINGS } ] },
    { id: 503, name: 'Taco Dorado (1pz)', price: 15.00, category: 'TACOS', pieces: 1, image: null, modifiers: [ { name: 'Relleno', type: 'radio', choices: FILLINGS } ] },

    // TOSTADAS
    { id: 601, name: 'Tostada', price: 40.00, category: 'TOSTADAS', pieces: 1, image: null, modifiers: [ { name: 'Relleno', type: 'radio', choices: FILLINGS } ] },

    // PATITAS
    { id: 701, name: 'Patitas de Puerco', price: 55.00, category: 'PATITAS', image: null, modifiers: [] },
    // QUESADILLAS
    { id: 702, name: 'Quesadilla (Maíz)', price: 40.00, category: 'QUESADILLAS', pieces: 1, image: null, modifiers: [ { name: 'Relleno', type: 'radio', choices: FILLINGS } ] },
    { id: 703, name: 'Quesadilla (Harina)', price: 35.00, category: 'QUESADILLAS', pieces: 1, image: null, modifiers: [ { name: 'Relleno', type: 'radio', choices: FILLINGS } ] },

    // POZOLE
    { id: 801, name: 'Pozole Básico', price: 50.00, category: 'POZOLE', image: null, modifiers: [ { name: 'Preparación', type: 'radio', choices: ['Batido', 'De Caldo', 'De Pollo'] }, { name: 'Complementos', type: 'checkbox', choices: ['Cebolla', 'Chile', 'Lechuga', 'Rábano'] } ] },
    { id: 802, name: 'Pozole Medio Especial', price: 55.00, category: 'POZOLE', image: null, modifiers: [ { name: 'Preparación', type: 'radio', choices: ['Batido', 'De Caldo', 'De Pollo'] }, { name: 'Complementos', type: 'checkbox', choices: ['Cebolla', 'Chile', 'Lechuga', 'Rábano'] } ] },
    { id: 803, name: 'Pozole Especial', price: 60.00, category: 'POZOLE', image: null, modifiers: [ { name: 'Preparación', type: 'radio', choices: ['Batido', 'De Caldo', 'De Pollo'] }, { name: 'Complementos', type: 'checkbox', choices: ['Cebolla', 'Chile', 'Lechuga', 'Rábano'] } ] },
    { id: 804, name: 'Pozole Súper Especial', price: 70.00, category: 'POZOLE', image: null, modifiers: [ { name: 'Preparación', type: 'radio', choices: ['Batido', 'De Caldo', 'De Pollo'] }, { name: 'Complementos', type: 'checkbox', choices: ['Cebolla', 'Chile', 'Lechuga', 'Rábano'] } ] },
    { id: 805, name: 'Pozole Mini', price: 20.00, category: 'POZOLE', image: null, modifiers: [ { name: 'Preparación', type: 'radio', choices: ['Batido', 'De Caldo', 'De Pollo'] }, { name: 'Complementos', type: 'checkbox', choices: ['Cebolla', 'Chile', 'Lechuga', 'Rábano'] } ] }
];

function getProductPieces(product) {
    if(!product) return 1;
    if(typeof product.pieces === 'number' && product.pieces > 0) return product.pieces;
    const match = String(product.name).match(/(\d+)\s*pz/i);
    if(match) return parseInt(match[1], 10);
    return 1;
}

let cart = []; 
let activeTickets = []; 
let dailySales = [];
let cocinaQueue = []; 
let serverNotifications = [];
let clients = []; // NEW: Customer DB
let lastProcessedNotif = Date.now();

let unreadNotifications = 0;
let currentProduct = null;
let currentQty = 1;
let currentUser = null; 
let currentTable = null; 
let currentCategory = 'POZOLE';

// --- DATABASE SYNC LOGIC ---

async function loadDb() {
    try {
        const res = await fetch('/api/state');
        if(!res.ok) return;
        const data = await res.json();
        
        const stringify = (obj) => JSON.stringify(obj || []);
        
        let needsRenderKds = stringify(data.cocinaQueue) !== stringify(cocinaQueue);
        let needsRenderConta = stringify(data.dailySales) !== stringify(dailySales);
        let needsRenderCobros = stringify(data.activeTickets) !== stringify(activeTickets);
        let needsRenderUsers = data.users && stringify(data.users) !== stringify(users) && data.users.length > 0;
        let needsRenderProducts = data.products && stringify(data.products) !== stringify(products) && data.products.length > 0;
        let needsRenderClients = stringify(data.clients) !== stringify(clients);
        
        cocinaQueue = data.cocinaQueue || [];
        dailySales = data.dailySales || [];
        if(data.activeTickets) activeTickets = data.activeTickets;
        if(data.users && data.users.length > 0) users = data.users;
        if(data.products && data.products.length > 0) products = data.products;
        if(data.clients) clients = data.clients;
        serverNotifications = data.notifications || [];
        
        if(needsRenderKds) renderKDS();
        if(needsRenderConta) renderContabilidad();
        if(needsRenderCobros) { renderMesas(); renderLlevar(); renderPedidos(); renderCobros(); }
        
        updateNavBadges();
        
        if(needsRenderUsers) {
            if(!currentUser) renderLoginUsers();
            if(currentUser && currentUser.role === 'administrador') renderUsersTable();
        }
        
        if(needsRenderProducts) { 
            renderGrid(); 
            if(currentUser && currentUser.role === 'administrador') renderMenu(); 
        }
        if(needsRenderClients) { renderClientes(); }
        
        checkServerNotifications();
        
    } catch(e) {
        console.log("No backend detected, running in local memory mode.");
    }
}

async function saveDb() {
    try {
        await fetch('/api/state', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                cocinaQueue,
                dailySales,
                activeTickets,
                notifications: serverNotifications,
                users,
                products,
                clients
            })
        });
    } catch(e) { }
}

setInterval(loadDb, 2000);
loadDb(); 

// --- AUTHENTICATION & PIN Logic ---
let pinBuffer = '';
let targetUserForPin = null;

function renderLoginUsers() {
    const grid = document.getElementById('login-users-grid');
    if(!grid) return;
    grid.innerHTML = '';
    users.forEach(u => {
        const card = document.createElement('div');
        card.className = 'user-login-card';
        card.innerHTML = `
            <div class="avatar">${u.name.charAt(0).toUpperCase()}</div>
            <div class="name">${u.name}</div>
            <div class="role">${u.role.toUpperCase()}</div>
        `;
        card.onclick = () => requestPin(u);
        grid.appendChild(card);
    });
}

function requestPin(user) {
    targetUserForPin = user;
    pinBuffer = '';
    updatePinDots();
    document.getElementById('pin-user-name').textContent = `PIN para ${user.name}`;
    document.getElementById('pin-modal').classList.add('active');
}

window.addPin = function(num) {
    if(pinBuffer.length < 4) {
        pinBuffer += String(num);
        updatePinDots();
        if(pinBuffer.length === 4) {
            setTimeout(verifyPin, 100);
        }
    }
};

function updatePinDots() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, index) => {
        if(index < pinBuffer.length) dot.classList.add('filled');
        else dot.classList.remove('filled');
    });
}

window.cancelPin = () => {
    document.getElementById('pin-modal').classList.remove('active');
    pinBuffer = '';
    targetUserForPin = null;
    updatePinDots();
};

window.deletePin = () => {
    if(pinBuffer.length > 0) {
        pinBuffer = pinBuffer.slice(0, -1);
        updatePinDots();
    }
};

// Keyboard listener for physical and bluetooth keyboards
window.addEventListener('keydown', (e) => {
    const pinModal = document.getElementById('pin-modal');
    if (pinModal && pinModal.classList.contains('active')) {
        if (e.key >= '0' && e.key <= '9') {
            window.addPin(e.key);
        } else if (e.key === 'Backspace') {
            window.deletePin();
        } else if (e.key === 'Escape') {
            window.cancelPin();
        } else if (e.key === 'Enter' && pinBuffer.length === 4) {
            verifyPin();
        }
    }
});

function verifyPin() {
    if(!targetUserForPin) return;
    // Look up latest user record in case it was updated by sync
    const current = users.find(u => u.id === targetUserForPin.id || u.name.toLowerCase() === targetUserForPin.name.toLowerCase()) || targetUserForPin;
    const userPin = String(current.pin || '').trim();
    
    // Accept either the user's specific PIN, or master PIN '1234' so no one is locked out
    if(userPin === pinBuffer || pinBuffer === '1234') {
        login(current);
    } else {
        alert(`PIN Incorrecto. Ingresa el PIN asignado a ${current.name} o el PIN maestro 1234.`);
        pinBuffer = '';
        updatePinDots();
    }
}

function login(user) {
    currentUser = user;
    document.getElementById('pin-modal').classList.remove('active');
    const loginEl = document.getElementById('login-screen');
    if(loginEl) {
        loginEl.classList.remove('active');
        loginEl.style.display = 'none';
    }
    const mainApp = document.getElementById('main-app');
    if(mainApp) mainApp.style.display = 'flex';
    
    lastProcessedNotif = Date.now();
    
    document.querySelector('.user-info .name').textContent = user.name;
    document.querySelector('.user-info .role').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    document.querySelector('.user-profile .avatar').textContent = user.name.charAt(0).toUpperCase();

    // Hide all role-based nav items (logout button excluded — CSS keeps it always visible)
    document.querySelectorAll('.nav-item:not(.nav-logout-btn)').forEach(el => el.style.display = 'none');

    let defaultView = 'mesas';

    const showNavItems = (views) => {
        views.forEach(v => {
            const btn = document.querySelector(`.nav-item[data-view="${v}"]`);
            if (btn) btn.style.display = 'flex';
        });
    };

    if (user.role === 'administrador') {
        showNavItems(['pos','mesas','llevar','pedidos','clientes','cobros','kds','contabilidad','menu','usuarios']);
    } else if (user.role === 'mesero') {
        showNavItems(['mesas','pos','llevar','pedidos','clientes','cobros']);
    } else if (user.role === 'cajera') {
        showNavItems(['pos','llevar','pedidos','cobros','contabilidad']);
        defaultView = 'cobros';
    } else if (user.role === 'cocinero') {
        showNavItems(['kds']);
        defaultView = 'kds';
    }

    // Set role on body — CSS uses this to show/hide #mobile-nav items (no JS inline-style needed)
    document.body.dataset.role = user.role;

    updateNotificationBadge();
    window.switchView(defaultView);
}

window.logout = () => {
    currentUser = null;
    currentTable = null;
    cart = [];
    document.body.removeAttribute('data-role'); // clear mobile-nav role
    document.getElementById('main-app').style.display = 'none';
    const loginEl = document.getElementById('login-screen');
    if(loginEl) {
        loginEl.classList.add('active');
        loginEl.style.display = 'flex';
    }
    renderLoginUsers();
};

renderLoginUsers();


// --- NOTIFICATIONS LOGIC ---
function checkServerNotifications() {
    if(!currentUser) return;
    
    serverNotifications.forEach(n => {
        if(n.id > lastProcessedNotif) {
            if(currentUser.role === 'administrador' || currentUser.role === 'mesero') {
                notificarMeseroLocal(n.msg, n.orderId);
            }
            lastProcessedNotif = Math.max(lastProcessedNotif, n.id);
        }
    });
}

function notificarMeseroLocal(msg, orderId = null) {
    unreadNotifications++;
    const badge = document.getElementById('notification-badge');
    if (badge) {
        badge.style.display = 'flex';
        badge.textContent = unreadNotifications;
    }
    
    const container = document.getElementById('toast-container');
    if (container) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.cursor = 'pointer';
        toast.innerHTML = `<i class="fa-solid fa-bell-concierge"></i> <span>${msg}</span>`;
        
        if(orderId) {
            toast.onclick = () => visualizarOrdenLista(orderId);
        }
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
    
    rebuildNotificationDropdown();
    renderMesas();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    const pendingCount = serverNotifications.filter(n => n.status !== 'delivered').length;
    if (pendingCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = pendingCount;
    } else {
        badge.style.display = 'none';
        badge.textContent = '0';
    }
}

window.toggleNotificationDropdown = function(e) {
    if(e) e.stopPropagation();
    const dd = document.getElementById('notification-dropdown');
    if(dd) {
        const isHidden = dd.style.display === 'none' || !dd.style.display;
        dd.style.display = isHidden ? 'block' : 'none';
        if(isHidden) {
            rebuildNotificationDropdown();
            updateNotificationBadge();
        }
    }
};

function rebuildNotificationDropdown() {
    const list = document.getElementById('notification-list');
    if(!list) return;
    list.innerHTML = '';
    
    // Only show pending ready orders that have NOT been served yet
    const readyNotifs = serverNotifications.filter(n => n.status !== 'delivered');
    
    if(readyNotifs.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:18px; font-size:0.85rem;"><i class="fa-solid fa-check-circle" style="color:var(--secondary); font-size:1.3rem; display:block; margin-bottom:6px;"></i>Sin platillos pendientes de servir</div>';
        return;
    }
    
    readyNotifs.forEach(n => {
        const item = document.createElement('div');
        item.className = 'notif-item ready';
        
        let itemsSummary = '';
        if(n.items && n.items.length > 0) {
            itemsSummary = `<div style="font-size:0.8rem; color:#475569; margin-top:3px;">` +
                n.items.map(it => `${it.qty}x ${it.product ? it.product.name : ''}`).join(', ') +
                `</div>`;
        }
        
        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <div style="flex:1;">
                    <div style="font-weight:700; font-size:0.9rem; color:var(--text-main);">
                        <i class="fa-solid fa-bell-concierge" style="color:#D97706; margin-right:4px;"></i>
                        ${n.table || 'Comanda'} ${n.orderId ? `(${n.orderId})` : ''}
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                        ${n.time || ''} ${n.waiter ? `| Mesero: ${n.waiter}` : ''}
                    </div>
                    ${itemsSummary}
                </div>
                <button type="button" class="action-btn" style="width:auto; padding:6px 12px; background:var(--secondary); color:white; border-radius:6px; font-size:0.78rem; font-weight:700; border:none; cursor:pointer; flex-shrink:0;" onclick="marcarEntregada(${n.id}, event)"><i class="fa-solid fa-check"></i> Servir</button>
            </div>
        `;
        
        item.onclick = () => {
            if(n.table && String(n.table).startsWith('Mesa ')) {
                const mesaNum = parseInt(n.table.replace('Mesa ', ''), 10);
                if(mesaNum) {
                    currentTable = mesaNum;
                    document.querySelector('.nav-item[data-view="pos"]').click();
                    document.getElementById('notification-dropdown').style.display = 'none';
                }
            } else if(n.orderId) {
                visualizarOrdenLista(n.orderId);
                document.getElementById('notification-dropdown').style.display = 'none';
            }
        };
        list.appendChild(item);
    });
}

window.marcarEntregada = async function(notifId, e) {
    if(e) e.stopPropagation();
    await loadDb();
    const notif = serverNotifications.find(n => n.id == notifId);
    if(notif) {
        notif.status = 'delivered';
        await saveDb();
        updateNotificationBadge();
        rebuildNotificationDropdown();
        renderMesas();
        showToast('✅ Comanda servida', 'success');
    }
};

window.marcarTodasEntregadas = async function(e) {
    if(e) e.stopPropagation();
    await loadDb();
    serverNotifications.forEach(n => { n.status = 'delivered'; });
    await saveDb();
    updateNotificationBadge();
    rebuildNotificationDropdown();
    renderMesas();
    showToast('✅ Todas las comandas marcadas como entregadas', 'success');
};

function updateNavBadges() {
    const mesasBadge = document.getElementById('mesas-badge');
    const llevarBadge = document.getElementById('llevar-badge');
    const pedidosBadge = document.getElementById('pedidos-badge');

    if(mesasBadge) {
        const count = activeTickets.filter(t => typeof t.table === 'number').length;
        mesasBadge.textContent = count;
        mesasBadge.style.display = count > 0 ? 'flex' : 'none';
        // Add subtle animation when it changes
        if(mesasBadge.dataset.lastCount !== String(count)) {
            mesasBadge.style.animation = 'pulse 0.3s ease';
            setTimeout(() => mesasBadge.style.animation = '', 300);
            mesasBadge.dataset.lastCount = count;
        }
    }

    if(llevarBadge) {
        const count = activeTickets.filter(t => String(t.table).startsWith('Llevar')).length;
        llevarBadge.textContent = count;
        llevarBadge.style.display = count > 0 ? 'flex' : 'none';
    }

    if(pedidosBadge) {
        const count = activeTickets.filter(t => String(t.table).startsWith('Pedido')).length;
        pedidosBadge.textContent = count;
        pedidosBadge.style.display = count > 0 ? 'flex' : 'none';
    }
}

window.onclick = function() {
    const dd = document.getElementById('notification-dropdown');
    if(dd) dd.style.display = 'none';
};


// --- DOM LOGIC (CLOCK, VIEWS, ETC) ---
function updateClock() {
    const clock = document.getElementById('clock');
    if(clock) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        clock.textContent = `${hours}:${minutes}`;
    }
}
setInterval(updateClock, 1000);
updateClock();

window.switchView = function(viewName) {
    // Update active state on desktop sidebar nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const btn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if(btn) btn.classList.add('active');

    // Update active state on mobile nav items
    document.querySelectorAll('.mnav-btn').forEach(n => n.classList.remove('active'));
    const mBtn = document.querySelector(`#mobile-nav .mnav-btn[data-view="${viewName}"]`);
    if(mBtn) mBtn.classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById('view-' + viewName);
    if(targetView) targetView.classList.add('active');
    
    if (viewName === 'kds') renderKDS();
    if (viewName === 'mesas') renderMesas();
    if (viewName === 'llevar') renderLlevar();
    if (viewName === 'pedidos') renderPedidos();
    if (viewName === 'clientes') renderClientes();
    if (viewName === 'menu') renderMenu();
    if (viewName === 'usuarios') renderUsersTable();
    if (viewName === 'cobros') renderCobros();
    if (viewName === 'pos') { renderGrid(); renderCart(); }
    if (viewName === 'reportes') renderReportes();
    if (viewName === 'contabilidad') renderContabilidad();
};

document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        window.switchView(btn.dataset.view);
    });
});

document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.cat;
        renderGrid();
    });
});

function renderGrid() {
    const grid = document.getElementById('products-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    let filteredProducts = products.filter(p => p.category === currentCategory);
    
    filteredProducts.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        const imageContent = p.image 
            ? `<img src="${p.image}" alt="${p.name}" style="width:100%; height:100%; object-fit:cover;">`
            : `<div class="product-logo"><span class="logo-rely">RELY</span><span class="logo-sub">Pozoleria, Tacos<br>y Enchiladas</span></div>`;

        card.innerHTML = `
            <div class="product-price-badge">$${p.price.toFixed(2)}</div>
            <div class="product-image">${imageContent}</div>
            <div class="product-info"><h3>${p.name}</h3></div>
        `;
        card.addEventListener('click', () => {
            if(!currentTable && (currentUser.role === 'mesero' || currentUser.role === 'administrador' || currentUser.role === 'cajera')) {
                alert('Por favor selecciona (o crea) una orden de Llevar o Pedido desde el menú lateral primero.');
                return;
            }
            openModal(p);
        });
        grid.appendChild(card);
    });
}
renderGrid();

// Modal Logic
const modalOverlay = document.getElementById('product-modal');
const modalUploadedImage = document.getElementById('modal-uploaded-image');
const modalCameraIcon = document.getElementById('modal-camera-icon');
const modalModifiersContainer = document.getElementById('modal-dynamic-modifiers');

// State for the piece-mixer (tacos / enchiladas mixed fillings)
let mixerSelections = {}; // { 'Picadillo': 2, 'Pollo': 1, ... }
let mixerTotalPieces = 0;
let isMixerMode = false;

function updateMixerCounter() {
    const badge = document.getElementById('mixer-counter-badge');
    if (!badge) return;
    const used = Object.values(mixerSelections).reduce((s, v) => s + v, 0);
    badge.textContent = `${used} de ${mixerTotalPieces} piezas`;
    badge.className = 'piece-counter-badge';
    if (used === mixerTotalPieces) badge.classList.add('complete');
    else if (used > mixerTotalPieces) badge.classList.add('overflow');
}

function renderMixerFillings() {
    const list = document.getElementById('mixer-fillings-list');
    if (!list) return;
    list.innerHTML = '';
    FILLINGS.forEach(filling => {
        const qty = mixerSelections[filling] || 0;
        const row = document.createElement('div');
        row.className = 'mixer-filling-row';
        row.innerHTML = `
            <span class="filling-name">${filling}</span>
            <div class="mixer-qty-controls">
                <button class="mixer-btn" onclick="mixerChange('${filling}', -1)" ${qty === 0 ? 'disabled' : ''}>-</button>
                <span class="filling-qty">${qty}</span>
                <button class="mixer-btn" onclick="mixerChange('${filling}', 1)">+</button>
            </div>`;
        list.appendChild(row);
    });
    updateMixerCounter();
}

window.mixerChange = function(filling, delta) {
    const current = mixerSelections[filling] || 0;
    const newVal = Math.max(0, current + delta);
    mixerSelections[filling] = newVal;
    renderMixerFillings();
};

function openModal(product) {
    currentProduct = product;
    currentQty = 1;
    mixerSelections = {};
    isMixerMode = false;
    document.getElementById('modal-title').textContent = product.name;
    document.getElementById('modal-price').textContent = `$${product.price.toFixed(2)}`;
    document.querySelector('.qty-val').textContent = currentQty;
    // Clear notes
    const notesInput = document.getElementById('product-notes-input');
    if (notesInput) notesInput.value = '';
    
    if (product.image) {
        modalUploadedImage.src = product.image;
        modalUploadedImage.style.display = 'block';
        modalCameraIcon.style.display = 'none';
    } else {
        modalUploadedImage.style.display = 'none';
        modalCameraIcon.style.display = 'inline-block';
    }
    
    // Dynamic Modifiers Rendering
    modalModifiersContainer.innerHTML = '';
    
    const isMixable = (product.category === 'TACOS' || product.category === 'ENCHILADAS' || product.category === 'SOPES') && getProductPieces(product) > 1;
    
    if (isMixable) {
        // Show mixer mode toggle
        mixerTotalPieces = getProductPieces(product) * currentQty;
        modalModifiersContainer.innerHTML = `
        <div style="padding: 12px 24px;">
            <div class="mixer-mode-selector">
                <button class="mixer-mode-btn active" id="btn-single-filling" onclick="setMixerMode(false)">Un solo relleno</button>
                <button class="mixer-mode-btn" id="btn-mix-filling" onclick="setMixerMode(true)">Mezclar rellenos</button>
            </div>
        </div>`;
        // Render the single filling radio options
        let singleHtml = '';
        FILLINGS.forEach((choice, index) => {
            singleHtml += `
            <label class="modifier-item">
                <input type="radio" name="mod_Relleno" value="${choice}" ${index === 0 ? 'checked' : ''}>
                <span>${choice}</span>
            </label>`;
        });
        modalModifiersContainer.innerHTML += `
        <div id="single-filling-group" class="modifier-group">
            <div class="modifier-header"><h3>RELLENO</h3><span>Selecciona 1</span></div>
            <div class="modifier-list">${singleHtml}</div>
        </div>`;
    } else if (product.modifiers && product.modifiers.length > 0) {
        product.modifiers.forEach(mod => {
            let choicesHtml = '';
            if(mod.type === 'radio') {
                mod.choices.forEach((choice, index) => {
                    choicesHtml += `
                    <label class="modifier-item">
                        <input type="radio" name="mod_${mod.name.replace(/\s/g, '')}" value="${choice}" ${index === 0 ? 'checked' : ''}>
                        <span>${choice}</span>
                    </label>`;
                });
            } else if (mod.type === 'checkbox') {
                mod.choices.forEach(choice => {
                    choicesHtml += `
                    <label class="modifier-item add-icon">
                        <input type="checkbox" name="mod_${mod.name.replace(/\s/g, '')}" value="${choice}">
                        <span>${choice}</span>
                    </label>`;
                });
            }
            modalModifiersContainer.innerHTML += `
            <div class="modifier-group">
                <div class="modifier-header">
                    <h3>${mod.name.toUpperCase()}</h3>
                    <span>${mod.type === 'radio' ? 'Selecciona 1' : 'Múltiples Opciones'}</span>
                </div>
                <div class="modifier-list">${choicesHtml}</div>
            </div>`;
        });
    } else {
        modalModifiersContainer.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-muted);">Sin preparación especial.</div>`;
    }

    // Show/hide mixer panel
    const mixerPanel = document.getElementById('modal-fillings-mixer');
    if (mixerPanel) mixerPanel.style.display = 'none';

    modalOverlay.classList.add('active');
}

window.setMixerMode = function(enabled) {
    isMixerMode = enabled;
    const singleGroup = document.getElementById('single-filling-group');
    const mixerPanel = document.getElementById('modal-fillings-mixer');
    const btnSingle = document.getElementById('btn-single-filling');
    const btnMix = document.getElementById('btn-mix-filling');
    
    if (enabled) {
        if (singleGroup) singleGroup.style.display = 'none';
        if (mixerPanel) {
            mixerPanel.style.display = 'block';
            mixerTotalPieces = getProductPieces(currentProduct) * currentQty;
            mixerSelections = {};
            renderMixerFillings();
        }
        if (btnSingle) btnSingle.classList.remove('active');
        if (btnMix) btnMix.classList.add('active');
    } else {
        if (singleGroup) singleGroup.style.display = 'block';
        if (mixerPanel) mixerPanel.style.display = 'none';
        mixerSelections = {};
        if (btnSingle) btnSingle.classList.add('active');
        if (btnMix) btnMix.classList.remove('active');
    }
};

window.addQuickNote = function(note) {
    const textarea = document.getElementById('product-notes-input');
    if (!textarea) return;
    const current = textarea.value.trim();
    textarea.value = current ? current + ', ' + note : note;
    textarea.focus();
};

window.closeModal = () => {
    if(modalOverlay) modalOverlay.classList.remove('active');
    currentProduct = null;
    mixerSelections = {};
    isMixerMode = false;
};

const photoUpload = document.getElementById('product-image-upload');
if(photoUpload) {
    photoUpload.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file && currentProduct) {
            const reader = new FileReader();
            reader.onload = function(event) {
                // Warning: In real world state sync this alters local memory only!
                currentProduct.image = event.target.result;
                modalUploadedImage.src = event.target.result;
                modalUploadedImage.style.display = 'block';
                modalCameraIcon.style.display = 'none';
                renderGrid();
            };
            reader.readAsDataURL(file);
        }
    });
}

document.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const icon = btn.querySelector('i');
        const qtyVal = document.querySelector('.qty-val');
        if(icon.classList.contains('fa-plus')) currentQty++;
        else if(icon.classList.contains('fa-minus') && currentQty > 1) currentQty--;
        qtyVal.textContent = currentQty;
        // Update mixer total pieces when quantity changes
        if (isMixerMode && currentProduct) {
            mixerTotalPieces = getProductPieces(currentProduct) * currentQty;
            renderMixerFillings();
        }
    });
});

// Cart & Orders Logic
window.addToCart = function() {
    if(!currentProduct) return;
    
    let selectedMods = [];
    let fillingsMix = null; // For mixed taco/enchilada orders
    
    if (isMixerMode) {
        // Build mixed fillings description
        const used = Object.values(mixerSelections).reduce((s, v) => s + v, 0);
        const totalNeeded = getProductPieces(currentProduct) * currentQty;
        if (used === 0) {
            // No fillings selected - use no modifier
        } else if (used !== totalNeeded) {
            const diff = totalNeeded - used;
            if (!confirm(`Faltan ${diff} piezas por asignar relleno. ¿Agregar de todas formas?`)) return;
        }
        // Build filling mix label
        fillingsMix = Object.entries(mixerSelections)
            .filter(([,v]) => v > 0)
            .map(([k, v]) => `${v}x${k}`)
            .join(' + ');
        if (fillingsMix) selectedMods.push(fillingsMix.toUpperCase());
    } else {
        // Single modifier mode (radio/checkbox)
        const isMixable = (currentProduct.category === 'TACOS' || currentProduct.category === 'ENCHILADAS' || currentProduct.category === 'SOPES') && getProductPieces(currentProduct) > 1;
        if (isMixable) {
            const checked = document.querySelector(`input[name="mod_Relleno"]:checked`);
            if(checked) selectedMods.push(checked.value.toUpperCase());
        } else if (currentProduct.modifiers && currentProduct.modifiers.length > 0) {
            currentProduct.modifiers.forEach(mod => {
                const safeName = mod.name.replace(/\s/g, '');
                if(mod.type === 'radio') {
                    const checked = document.querySelector(`input[name="mod_${safeName}"]:checked`);
                    if(checked) selectedMods.push(checked.value.toUpperCase());
                } else if (mod.type === 'checkbox') {
                    const checked = document.querySelectorAll(`input[name="mod_${safeName}"]:checked`);
                    checked.forEach(c => selectedMods.push(c.value.toUpperCase()));
                }
            });
        }
    }

    // Capture notes
    const notesInput = document.getElementById('product-notes-input');
    const notes = notesInput ? notesInput.value.trim() : '';

    cart.push({ id: Date.now(), product: currentProduct, qty: currentQty, modifiers: selectedMods, notes: notes });
    
    renderCart();
    window.closeModal();
};

window.removeFromCart = function(cartId) {
    cart = cart.filter(item => item.id !== cartId);
    renderCart();
};

function renderCart(isPaymentMode = false) {
    const container = document.getElementById('cart-items');
    const sentContainer = document.getElementById('cart-sent-items');
    const totalEl = document.getElementById('cart-total');
    const btnTotalEl = document.getElementById('btn-total');
    const mobileBadge = document.getElementById('mobile-cart-badge');
    
    const getOrderTitle = (t) => String(t).startsWith('Llevar') || String(t).startsWith('Pedido') ? t : 'Mesa ' + t;
    document.getElementById('pos-table-title').textContent = currentTable ? `Menú Principal (${getOrderTitle(currentTable)})` : `Menú Principal (Sin Orden)`;
    
    let total = 0;
    let newItemsHtml = '';
    let sentItemsHtml = '';
    let sentTotalQty = 0;
    
    cart.forEach(item => {
        const itemTotal = item.product.price * item.qty;
        total += itemTotal;
        const notesHtml = item.notes ? `<div class="cart-item-notes"><i class="fa-solid fa-comment-dots"></i> ${item.notes}</div>` : '';
        newItemsHtml += `
            <div class="cart-item">
                <div class="cart-item-header">
                    <div class="cart-item-title"><span class="qty-badge" style="background:var(--primary)">${item.qty}</span>${item.product.name}</div>
                    <div class="cart-item-price">$${itemTotal.toFixed(2)}</div>
                </div>
                <div class="cart-item-modifiers">${item.modifiers.join(', ')}</div>
                ${notesHtml}
                <div class="cart-item-actions"><button onclick="removeFromCart(${item.id})"><i class="fa-solid fa-trash"></i></button></div>
            </div>`;
    });

    let abonoTotal = 0;
    if (currentTable) {
        const ticket = activeTickets.find(t => t.table === currentTable);
        if (ticket) {
            if (ticket.items) {
                ticket.items.forEach(item => {
                    const itemTotal = item.product.price * item.qty;
                    total += itemTotal;
                    sentTotalQty += item.qty;
                    sentItemsHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>${item.qty}x ${item.product.name}</span><span>$${itemTotal.toFixed(2)}</span></div>`;
                });
            }
            if (ticket.abonos) {
                abonoTotal = ticket.abonos.reduce((sum, a) => sum + a.amount, 0);
            }
        }
    }

    const finalTotal = total - abonoTotal;

    if (mobileBadge) mobileBadge.textContent = cart.length + sentTotalQty;
    
    if(cart.length === 0 && newItemsHtml === '') {
        container.innerHTML = `<div class="empty-cart"><i class="fa-solid fa-basket-shopping"></i><p>Sin nueva orden</p></div>`;
    } else {
        container.innerHTML = newItemsHtml;
    }
    
    if (sentContainer) {
        sentContainer.innerHTML = sentItemsHtml || '<span style="color:var(--text-muted); font-size:0.75rem;">Nada enviado aún</span>';
        if(abonoTotal > 0) {
            sentContainer.innerHTML += `
                <div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:4px; border-top:1px dashed var(--border); font-weight:bold; color:var(--success);">
                    <span>ABONADO:</span>
                    <span>-$${abonoTotal.toFixed(2)}</span>
                </div>`;
        }
    }
    
    const totalStr = `$${finalTotal.toFixed(2)}`;
    if(totalEl) totalEl.textContent = totalStr;
    if(btnTotalEl) btnTotalEl.textContent = totalStr;
}

// Comandar a Cocina (KDS)
window.comandarCocina = async function() {
    if (!currentTable) return alert('Porfavor selecciona (o crea) una orden primero.');
    if (cart.length === 0) return alert('No hay artículos pendientes en el carrito.');
    
    if (String(currentTable).includes(' - Nuevo ')) {
        const type = String(currentTable).startsWith('Llevar') ? 'Llevar' : 'Pedido';
        openClientModal(null, type);
        return;
    }
    
    await loadDb(); 

    let ticket = activeTickets.find(t => t.table === currentTable);
    if(!ticket) {
        ticket = {
            id: 'TKT-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
            table: currentTable,
            items: [],
            waiter: currentUser ? currentUser.name : 'Indefinido',
            time: new Date().toLocaleTimeString(),
            dateObj: new Date().toISOString()
        };
        activeTickets.push(ticket);
    }
    
    ticket.items.push(...cart);

    const getOrderTitle = (t) => String(t).startsWith('Llevar') || String(t).startsWith('Pedido') ? t : 'Mesa ' + t;
    const kdsOrder = {
        id: 'O-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0'),
        time: new Date().toLocaleTimeString(),
        table: getOrderTitle(currentTable),
        items: [...cart],
        waiter: currentUser ? currentUser.name : 'Mesa ' + currentTable
    };
    
    cocinaQueue.push(kdsOrder);
    renderKDS(); 
    
    await saveDb();
    
    // Close cart sidebar on mobile
    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar) sidebar.classList.remove('open');
    const backdrop = document.getElementById('cart-backdrop');
    if (backdrop) backdrop.classList.remove('active');
    
    // Show toast instead of alert
    showToast(`✅ Comanda enviada para: ${getOrderTitle(currentTable)}`, 'success');
    
    cart = [];
    let targetView = 'mesas';
    if(String(currentTable).startsWith('Llevar')) targetView = 'llevar';
    if(String(currentTable).startsWith('Pedido')) targetView = 'pedidos';
    currentTable = null;
    
    const navBtn = document.querySelector(`.nav-item[data-view="${targetView}"]`);
    if(navBtn) navBtn.click();
};

// Cook Screen Rendering
function renderKDS() {
    const grid = document.getElementById('kds-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    // Update order count badge
    const countBadge = document.getElementById('kds-order-count');
    if (countBadge) countBadge.textContent = `${cocinaQueue.length} ${cocinaQueue.length === 1 ? 'orden' : 'órdenes'}`;
    
    if(cocinaQueue.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; padding: 40px; color: var(--text-muted); font-size:1.2rem;">🎉 No hay órdenes pendientes en cocina. ¡Todo listo!</div>`;
        return;
    }

    cocinaQueue.forEach(ticket => {
        const card = document.createElement('div');
        card.className = 'kds-ticket';
        
        let itemsHtml = '';
        ticket.items.forEach(item => {
            const mods = item.modifiers && item.modifiers.length > 0
                ? `<span class="kds-modifiers">📌 ${item.modifiers.join(' | ')}</span>`
                : '';
            const notesEl = item.notes
                ? `<div class="kds-item-notes">💬 ${item.notes}</div>`
                : '';
            itemsHtml += `
            <div class="kds-item">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <span><strong style="color:var(--primary); font-size:1.3rem;">${item.qty}x</strong> <strong>${item.product.name}</strong></span>
                </div>
                ${mods}
                ${notesEl}
            </div>`;
        });

        const tableDisplay = ticket.table || '';
        card.innerHTML = `
            <div class="kds-header">
                <span style="font-weight:800; font-size:1rem;">🍽️ ${tableDisplay}</span>
                <span style="font-size:0.85rem; color:rgba(255,255,255,0.75);">${ticket.time}</span>
            </div>
            <div style="background:#F1F5F9; font-weight:700; color:var(--text-muted); padding:5px 15px; font-size:0.8rem;">👨‍🍳 ${ticket.waiter} &nbsp;|&nbsp; <span style="color:#1D4ED8;">Folio: ${ticket.id}</span></div>
            <div class="kds-body">
                ${itemsHtml}
            </div>
            <div class="kds-footer">
                <button class="btn-listo" onclick="marcarListo('${ticket.id}')"><i class="fa-solid fa-check-double"></i> ¡LISTO!</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.marcarListo = async function(ticketId) {
    await loadDb();
    const readyTicket = cocinaQueue.find(t => t.id === ticketId);
    cocinaQueue = cocinaQueue.filter(t => t.id !== ticketId);
    
    const notif = {
        id: Date.now(),
        orderId: ticketId,
        table: readyTicket ? readyTicket.table : '',
        waiter: readyTicket ? readyTicket.waiter : '',
        items: readyTicket ? readyTicket.items : [],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        msg: readyTicket ? `🍽️ <strong>${readyTicket.table}</strong>: ¡Orden ${ticketId} lista para servir!` : `La orden <strong>${ticketId}</strong> ya está preparada y lista.`,
        status: 'ready'
    };
    serverNotifications.unshift(notif);
    if(serverNotifications.length > 50) serverNotifications.pop();

    await saveDb();
    renderKDS();
    renderMesas();
    checkServerNotifications();
    showToast(`👨‍🍳 Comanda ${ticketId} lista para servir`, 'success');
};

// --- TABLE MANAGEMENT ---
function renderMesas() {
    const grid = document.getElementById('mesas-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    for(let i=1; i<=12; i++) {
        const activeTicket = activeTickets.find(t => t.table === i);
        const tableStr = `Mesa ${i}`;
        const hasReadyFood = serverNotifications.some(n => n.table === tableStr && n.status === 'ready');
        const card = document.createElement('div');
        let cardClass = activeTicket ? 'mesa-card active-mesa' : 'mesa-card';
        if(hasReadyFood) {
            cardClass += ' mesa-flashing-ready';
        }
        card.className = cardClass;
        card.style.cursor = 'pointer';
        card.onclick = () => {
            currentTable = i;
            document.querySelector('.nav-item[data-view="pos"]').click();
        };
        
        const readyBadgeHtml = hasReadyFood
            ? `<span class="badge-food-ready"><i class="fa-solid fa-bell-concierge"></i> ¡PLATILLOS LISTOS!</span>`
            : '';
        const entregarBtnHtml = hasReadyFood
            ? `<button class="btn-entregar-mesa" onclick="event.stopPropagation(); entregarComidaMesa(${i})"><i class="fa-solid fa-check-double"></i> Servir / Entregar</button>`
            : '';
            
        if (activeTicket) {
            let itemsCount = activeTicket.items.reduce((s, it) => s + it.qty, 0);
            card.innerHTML = `
                <div class="mesa-card-header">
                    <h3>Mesa ${i}</h3>
                    <div style="display:flex; gap:6px; align-items:center;">
                        ${readyBadgeHtml}
                        <span class="folio" style="background:var(--primary); color:white;">Ocupada</span>
                    </div>
                </div>
                <div class="mesa-card-body">
                    <div class="info-row"><i class="fa-solid fa-user"></i> <span>${activeTicket.waiter}</span></div>
                    <div class="info-row"><i class="fa-regular fa-clock"></i> <span>${activeTicket.time}</span></div>
                    <div class="info-row"><i class="fa-solid fa-utensils"></i> <span>${itemsCount} artículos</span></div>
                    ${entregarBtnHtml}
                </div>
                <div class="mesa-card-footer" style="background:#EFF6FF;">
                    <button class="btn-ver-cuenta" style="color:var(--primary);"><i class="fa-solid fa-plus"></i> AGREGAR / VER</button>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="mesa-card-header">
                    <h3>Mesa ${i}</h3>
                    <div style="display:flex; gap:6px; align-items:center;">
                        ${readyBadgeHtml}
                        <span class="folio" style="background:#E2E8F0; color:var(--text-muted)">Libre</span>
                    </div>
                </div>
                <div class="mesa-card-body" style="justify-content:center; align-items:center; opacity:0.5;">
                    <i class="fa-solid fa-chair" style="font-size:3rem;"></i>
                    ${entregarBtnHtml}
                </div>
            `;
        }
        grid.appendChild(card);
    }
    updateNavBadges();
}

window.entregarComidaMesa = async function(tableNum) {
    await loadDb();
    const tableStr = `Mesa ${tableNum}`;
    serverNotifications.forEach(n => {
        if(n.table === tableStr) n.status = 'delivered';
    });
    await saveDb();
    renderMesas();
    rebuildNotificationDropdown();
    showToast(`✅ Comida servida en Mesa ${tableNum}`, 'success');
};

// --- DYNAMIC ORDERS (LLEVAR / PEDIDOS) ---
function renderLlevar() { renderDynamicOrders('llevar-grid', 'Llevar', 'pos'); }
function renderPedidos() { renderDynamicOrders('pedidos-grid', 'Pedido', 'pos'); }

// --- CLIENT MANAGEMENT ---
function renderClientes() {
    const tableBody = document.getElementById('clients-table-body');
    if(!tableBody) return;
    tableBody.innerHTML = '';
    
    if(clients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">No hay clientes registrados.</td></tr>';
        return;
    }
    
    clients.forEach(c => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid var(--border)';
        row.innerHTML = `
            <td style="padding:12px;"><strong>${c.name}</strong></td>
            <td>${c.phone || '-'}</td>
            <td style="font-size:0.85rem; color:var(--text-muted);">${c.address || '-'}</td>
            <td>
                <div style="display:flex; gap:10px;">
                    <button class="action-btn secondary" style="width:auto; padding:5px 10px;" onclick="startOrderFromClient('${c.id}', 'Llevar')" title="Venta Llevar"><i class="fa-solid fa-bag-shopping"></i></button>
                    <button class="action-btn secondary" style="width:auto; padding:5px 10px;" onclick="startOrderFromClient('${c.id}', 'Pedido')" title="Venta Domicilio"><i class="fa-solid fa-motorcycle"></i></button>
                    <button class="action-btn" style="width:auto; padding:5px 10px;" onclick="editClient('${c.id}')"><i class="fa-solid fa-edit"></i></button>
                    <button class="action-btn" style="width:auto; padding:5px 10px; color:var(--danger);" onclick="deleteClient('${c.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

let pendingOrderType = null; // To know if we go to Llevar or Pedido after saving from Llevar/Pedidos view

window.openClientModal = function(client = null, forceType = null) {
    const modal = document.getElementById('client-form-modal');
    const btnOmitir = document.getElementById('btn-omitir-client');
    const datalist = document.getElementById('clients-list-options');
    pendingOrderType = forceType;
    
    if(datalist) {
        datalist.innerHTML = clients.map(c => `<option value="${c.name}">`).join('');
    }

    if(btnOmitir) btnOmitir.style.display = (forceType === 'Llevar') ? 'block' : 'none';

    if(client) {
        document.getElementById('client-form-title').textContent = 'Editar Cliente';
        document.getElementById('client-form-id').value = client.id;
        document.getElementById('client-form-name').value = client.name;
        document.getElementById('client-form-phone').value = client.phone || '';
        document.getElementById('client-form-address').value = client.address || '';
        document.getElementById('btn-save-client').textContent = 'Guardar Cambios';
    } else {
        document.getElementById('client-form-title').textContent = 'Nuevo Cliente';
        document.getElementById('client-form-id').value = '';
        document.getElementById('client-form-name').value = '';
        document.getElementById('client-form-phone').value = '';
        document.getElementById('client-form-address').value = '';
        document.getElementById('btn-save-client').textContent = pendingOrderType ? 'Guardar y Tomar Orden' : 'Guardar Cliente';
    }
    modal.classList.add('active');
};

window.closeClientModal = () => {
    document.getElementById('client-form-modal').classList.remove('active');
    pendingOrderType = null;
};

window.onClientNameChange = function() {
    const nameInput = document.getElementById('client-form-name');
    const name = nameInput.value.trim();
    if(!name) return;
    
    const client = clients.find(c => c.name.toLowerCase() === name.toLowerCase());
    if(client) {
        document.getElementById('client-form-id').value = client.id;
        document.getElementById('client-form-phone').value = client.phone || '';
        document.getElementById('client-form-address').value = client.address || '';
    } else {
        // If they start typing a NEW name, ensure ID is cleared
        document.getElementById('client-form-id').value = '';
    }
};

window.saveClient = async function() {
    const id = document.getElementById('client-form-id').value;
    const name = document.getElementById('client-form-name').value.trim();
    const phone = document.getElementById('client-form-phone').value.trim();
    const address = document.getElementById('client-form-address').value.trim();
    
    if(!name) return alert("El nombre es obligatorio.");
    if(pendingOrderType === 'Pedido' && (!phone || !address)) {
        return alert("Para pedidos a domicilio, el teléfono y la dirección son obligatorios.");
    }
    
    await loadDb();
    
    let clientObj;
    const existingIdx = id ? clients.findIndex(c => c.id == id) : clients.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
    
    if(existingIdx !== -1) {
        clients[existingIdx] = { ...clients[existingIdx], name, phone, address };
        clientObj = clients[existingIdx];
    } else {
        clientObj = { id: 'C-' + Date.now(), name, phone, address };
        clients.push(clientObj);
    }
    
    await saveDb();
    
    if(pendingOrderType) {
        const typeToTake = pendingOrderType;
        // Cambiar nombre de la orden antes de comandar
        startOrderForClientName(clientObj.name, typeToTake);
        
        if(cart.length > 0) {
            // Comantar de inmediato de forma asíncrona pero secuencial
            await comandarCocina();
        }
    }
    
    closeClientModal();
    renderClientes();
};

window.omitirCliente = function() {
    const type = pendingOrderType || 'Llevar';
    closeClientModal();
    startOrderForClientName("Cliente Anónimo", type);
    
    if(cart.length > 0) {
        setTimeout(() => {
            comandarCocina();
        }, 50);
    }
};

window.editClient = function(id) {
    const c = clients.find(x => x.id == id);
    if(c) window.openClientModal(c);
};

window.deleteClient = async function(id) {
    if(confirm('¿Seguro de eliminar este cliente?')) {
        await loadDb();
        clients = clients.filter(c => c.id != id);
        await saveDb();
        renderClientes();
    }
};

window.startOrderFromClient = function(clientId, type) {
    const c = clients.find(x => x.id == clientId);
    if(c) startOrderForClientName(c.name, type);
};

function startOrderForClientName(clientName, type) {
    currentTable = `${type} - ${clientName}`;
    document.querySelector('.nav-item[data-view="pos"]').click();
}

// Override the onclick for "New Client" in Llevar/Pedidos
function setupDynamicOrderClicks() {
    // This is handled by modifying the onclick in the generated HTML from renderDynamicOrders
}

// Re-write renderDynamicOrders to use client modal
function renderDynamicOrders(gridId, typePrefix, targetViewId) {
    const grid = document.getElementById(gridId);
    if(!grid) return;
    grid.innerHTML = '';
    
    const newCard = document.createElement('div');
    newCard.className = 'mesa-card';
    newCard.style.cursor = 'pointer';
    newCard.style.border = '2px dashed var(--primary)';
    newCard.style.background = '#EFF6FF';
    newCard.onclick = () => {
        let maxId = 0;
        activeTickets.forEach(t => {
            if(typeof t.table === 'string' && t.table.startsWith(typePrefix + " ")) {
                let parts = t.table.split(" - ");
                if(parts[0].includes(typePrefix)) {
                     // Try to find a numeric id if any
                }
            }
        });
        currentTable = `${typePrefix} - Nuevo ${Date.now().toString().slice(-4)}`;
        document.querySelector('.nav-item[data-view="pos"]').click();
    };
    
    newCard.innerHTML = `
        <div class="mesa-card-body" style="justify-content:center; align-items:center; color:var(--primary); text-align:center;">
            <i class="fa-solid fa-plus" style="font-size:2rem; margin-bottom:10px;"></i>
            <h3 style="margin:0;">NUEVA ORDEN</h3>
        </div>
    `;
    grid.appendChild(newCard);

    const activeOfThisType = activeTickets.filter(t => typeof t.table === 'string' && t.table.startsWith(typePrefix + " "));
    
    activeOfThisType.forEach(activeTicket => {
        const card = document.createElement('div');
        card.className = 'mesa-card active-mesa';
        card.style.cursor = 'pointer';
        card.onclick = () => {
            currentTable = activeTicket.table;
            document.querySelector('.nav-item[data-view="pos"]').click();
        };
        
        let itemsCount = activeTicket.items.reduce((s, it) => s + it.qty, 0);
        card.innerHTML = `
            <div class="mesa-card-header">
                <h3 style="font-size:0.9rem;">${activeTicket.table}</h3>
                <span class="folio" style="background:var(--primary); color:white;">Ocupado</span>
            </div>
            <div class="mesa-card-body" style="padding:10px;">
                <div class="info-row"><i class="fa-solid fa-user"></i> <span>${activeTicket.waiter}</span></div>
                <div class="info-row"><i class="fa-regular fa-clock"></i> <span>${activeTicket.time}</span></div>
                <div class="info-row"><i class="fa-solid fa-utensils"></i> <span>${itemsCount} artículos</span></div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- USER MANAGEMENT ---
function renderUsersTable() {
    const tableBody = document.getElementById('users-table-body');
    if(!tableBody) return;
    tableBody.innerHTML = '';
    
    users.forEach(u => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid var(--border)';
        row.innerHTML = `
            <td style="padding:12px;"><strong>${u.name}</strong></td>
            <td>${u.role}</td>
            <td><code style="background:#f1f5f9; padding:2px 5px; border-radius:4px;">${currentUser && currentUser.role === 'administrador' ? u.pin : '****'}</code></td>
            <td>
                <div style="display:flex; gap:10px;">
                    <button class="action-btn" style="width:auto; padding:5px 10px;" onclick="editUser(${u.id})"><i class="fa-solid fa-edit"></i></button>
                    <button class="action-btn" style="width:auto; padding:5px 10px; color:var(--danger);" onclick="deleteUser(${u.id})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// --- COBROS VIEW & TICKETING ---
function renderCobros() {
    const grid = document.getElementById('cobros-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    if(activeTickets.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 20px; color: var(--text-muted);">No hay mesas activas para cobrar.</div>`;
        return;
    }
    
    activeTickets.forEach(ticket => {
        const total = ticket.items.reduce((sum, item) => sum + (item.product.price * item.qty), 0);
        const abonos = ticket.abonos || [];
        const abonoTotal = abonos.reduce((s, a) => s + a.amount, 0);
        const saldo = total - abonoTotal;
        const card = document.createElement('div');
        card.className = 'mesa-card active-mesa';
        const getOrderTitle = (t) => String(t).startsWith('Llevar') || String(t).startsWith('Pedido') ? t : 'Mesa ' + t;
        card.innerHTML = `
            <div class="mesa-card-header">
                <h3>${getOrderTitle(ticket.table)}</h3>
                <span class="folio">${ticket.id}</span>
            </div>
            <div class="mesa-card-body">
                <div class="info-row"><i class="fa-solid fa-user"></i> <span>${ticket.waiter}</span></div>
                <div class="info-row"><i class="fa-regular fa-clock"></i> <span>${ticket.time}</span></div>
                <div class="info-row"><h2 style="color:var(--text-main); margin-top:10px;">$${saldo.toFixed(2)}</h2></div>
            </div>
            <div class="mesa-card-footer" style="display:flex; flex-direction:column; gap:8px;">
                <button style="width:100%; padding:10px; border-radius:6px; background:#3B82F6; color:white; font-weight:700; cursor:pointer; border:none;" onclick="prepararImpresionFinal('${ticket.id}')">
                    <i class="fa-solid fa-print"></i> Ver Cuenta e Imprimir
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// cobrarTicket is now replaced by prepararImpresionFinal + ejecutarImpresionTermica + finalizarTicket
// Legacy alias for any existing references:
async function cobrarTicket(ticketId) {
    window.prepararImpresionFinal(ticketId);
}

window.printDetailedReport = function() {
    const startInput = document.getElementById('report-date-start');
    const endInput = document.getElementById('report-date-end');
    const start = new Date(startInput.value);
    const end = new Date(endInput.value);
    
    let filteredSales = dailySales.filter(ticket => {
        if(!ticket.dateObj) return true; 
        const ticketDate = new Date(ticket.dateObj);
        return ticketDate >= start && ticketDate <= end;
    });

    let detailsHtml = '';
    let grandTotal = 0;

    filteredSales.forEach(t => {
        grandTotal += t.total;
        detailsHtml += `
            <div style="border-bottom: 1px solid #ccc; padding: 10px 0;">
                <div style="display:flex; justify-content:space-between; font-weight:bold;">
                    <span>Ticket: ${t.id} - ${t.time}</span>
                    <span>$${t.total.toFixed(2)}</span>
                </div>
                <div style="font-size:0.8rem; color:#555;">Atendió: ${t.waiter} | ${t.itemsCount} artículos</div>
            </div>
        `;
    });

    const reportHtml = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="margin:0;">RELY - Reporte Detallado</h2>
            <p style="margin:5px 0;">Periodo: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}</p>
        </div>
        <div>${detailsHtml}</div>
        <div style="display:flex; justify-content:space-between; font-size: 1.2rem; font-weight: bold; margin-top: 20px; border-top: 2px solid #000; padding-top: 10px;">
            <span>TOTAL GENERAL</span>
            <span>$${grandTotal.toFixed(2)}</span>
        </div>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(`<html><head><style>body { font-family: sans-serif; padding: 20px; }</style></head><body>${reportHtml}</body></html>`);
    iframe.contentWindow.document.close();
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 200);
};

const printBtn = document.getElementById('btn-finalizar');
if(printBtn) {
    printBtn.addEventListener('click', function() {
        if (cart.length > 0) {
            alert("Primero debes comandar los artículos pendientes.");
            return;
        }
        document.querySelector('.nav-item[data-view="cobros"]').click();
    });
}

window.visualizarOrdenLista = function(orderId) {
    const ticket = activeTickets.find(t => t.id === orderId || t.table.includes(orderId));
    const modal = document.getElementById('notification-detail-modal');
    const content = document.getElementById('notif-detail-content');
    
    if(ticket) {
        content.innerHTML = `
            <p><strong>Ubicación:</strong> ${ticket.table}</p>
            <p><strong>Atiende:</strong> ${ticket.waiter}</p>
            <hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">
            <p><strong>Artículos:</strong></p>
            <ul style="padding-left: 20px;">
                ${ticket.items.map(it => `<li>${it.qty}x ${it.product.name}</li>`).join('')}
            </ul>
        `;
        modal.classList.add('active');
    }
};

window.saveAbono = async function() {
    const amount = parseFloat(document.getElementById('abono-amount').value);
    if(isNaN(amount) || amount <= 0) return alert("Por favor ingresa un monto válido.");
    
    const ticket = activeTickets.find(t => t.table === currentTable);
    if(!ticket) return alert("No hay una orden activa seleccionada.");
    
    if(!ticket.abonos) ticket.abonos = [];
    ticket.abonos.push({
        amount: amount,
        time: new Date().toLocaleTimeString(),
        waiter: currentUser.name
    });
    
    await saveDb();
    document.getElementById('abono-modal').classList.remove('active');
    renderCart();
    alert(`Abono de $${amount.toFixed(2)} registrado.`);
};

window.openAbonarModal = function() {
    if(!currentTable) return alert("Selecciona una mesa primero.");
    document.getElementById('abono-amount').value = '';
    document.getElementById('abono-modal').classList.add('active');
};


// --- ADMINISTRADOR: REPORTES LOGIC ---
window.renderReportes = function() {
    const startInput = document.getElementById('report-date-start');
    const endInput = document.getElementById('report-date-end');
    
    // Default dates if empty
    if(!startInput.value) {
        const d = new Date(); d.setDate(d.getDate() - 7); // Last 7 days by default
        startInput.valueAsDate = d;
    }
    if(!endInput.value) endInput.valueAsDate = new Date();

    const startStr = startInput.value;
    const endStr = endInput.value;

    let filteredSales = dailySales.filter(ticket => {
        if(!ticket.dateObj) return true; 
        const tDate = new Date(ticket.dateObj);
        // Compare YYYY-MM-DD strings in local time to avoid UTC shifts
        const localDateStr = tDate.toLocaleDateString('en-CA'); 
        return localDateStr >= startStr && localDateStr <= endStr;
    });

    const totalRevenue = filteredSales.reduce((sum, t) => sum + t.total, 0);
    
    document.getElementById('report-total-amount').textContent = `$${totalRevenue.toFixed(2)}`;
    document.getElementById('report-total-tickets').textContent = filteredSales.length;

    // Detailed list in report view
    const listContainer = document.getElementById('report-details-list');
    if(listContainer) {
        listContainer.innerHTML = '';
        if(filteredSales.length === 0) {
            listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">No hay ventas en este periodo.</div>';
        } else {
            filteredSales.slice().reverse().forEach(ticket => {
                const row = document.createElement('div');
                row.className = 'ticket-record';
                row.innerHTML = `
                    <div class="ticket-record-info">
                        <strong>${ticket.id}</strong> - ${ticket.time} (Atendió: ${ticket.waiter})<br>
                        <span style="font-size:0.8rem; color:var(--text-muted);">${ticket.itemsCount} artículos</span>
                    </div>
                    <div class="ticket-record-total">$${ticket.total.toFixed(2)}</div>
                `;
                listContainer.appendChild(row);
            });
        }
    }
}

// --- CONTABILIDAD LOGIC ---
function renderContabilidad() {
    const listContainer = document.getElementById('tickets-list');
    if(!listContainer) return;

    const startInput = document.getElementById('conta-date-start');
    const endInput = document.getElementById('conta-date-end');
    
    if(!startInput.value) {
        startInput.valueAsDate = new Date();
    }
    if(!endInput.value) {
        endInput.valueAsDate = new Date();
    }

    const startStr = startInput.value;
    const endStr = endInput.value;
    
    const filteredSales = dailySales.filter(ticket => {
        if(!ticket.dateObj) return true;
        const tDate = new Date(ticket.dateObj);
        const localDateStr = tDate.toLocaleDateString('en-CA');
        return localDateStr >= startStr && localDateStr <= endStr;
    });

    const totalVentas = filteredSales.reduce((sum, ticket) => sum + ticket.total, 0);
    
    const contaTotal = document.getElementById('conta-total-ventas');
    const contaCount = document.getElementById('conta-total-tickets');
    if(contaTotal) contaTotal.textContent = `$${totalVentas.toFixed(2)}`;
    if(contaCount) contaCount.textContent = filteredSales.length;
    
    if (filteredSales.length === 0) {
        listContainer.innerHTML = `<div class="empty-tickets">No hay ventas registradas en este periodo.</div>`;
        return;
    }

    listContainer.innerHTML = '';
    filteredSales.slice().reverse().forEach(ticket => {
        const row = document.createElement('div');
        row.className = 'ticket-record';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '12px';
        row.style.borderBottom = '1px solid var(--border)';
        row.innerHTML = `
            <div class="ticket-record-info">
                <strong style="color:var(--primary); font-size:1rem;">${ticket.id}</strong> - <span>${ticket.time}</span> (${ticket.table || 'Venta'})<br>
                <span style="font-size:0.8rem; color:#64748B;">Atendió: ${ticket.waiter} | ${ticket.itemsCount} artículos</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <div class="ticket-record-total" style="font-weight:700; font-size:1.15rem; color:var(--text-main);">$${ticket.total.toFixed(2)}</div>
                <button class="action-btn" style="width:auto; padding:6px 12px; background:var(--primary); color:white; border-radius:6px; font-weight:600; font-size:0.8rem; display:flex; align-items:center; gap:6px; border:none; cursor:pointer;" onclick="reimprimirTicketContabilidad('${ticket.id}')" title="Reimprimir Ticket">
                    <i class="fa-solid fa-print"></i> Reimprimir
                </button>
            </div>
        `;
        listContainer.appendChild(row);
    });
}


// --- OTHERS ---
window.toggleCart = function(forceState) {
    const sidebar = document.getElementById('cart-sidebar');
    const backdrop = document.getElementById('cart-backdrop');
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('open');
    const newState = forceState !== undefined ? forceState : !isOpen;
    if (newState) {
        sidebar.classList.add('open');
        if (backdrop) backdrop.classList.add('active');
        // Push history state so back button closes it
        history.pushState({ cartOpen: true }, '');
    } else {
        sidebar.classList.remove('open');
        if (backdrop) backdrop.classList.remove('active');
    }
};

const cartToggleBtn = document.getElementById('cart-toggle-btn');
if(cartToggleBtn) {
    cartToggleBtn.addEventListener('click', () => toggleCart());
}

// --- THERMAL PRINT FUNCTIONS ---
let currentPrintTicketId = null;
let isReprintMode = false;

// Print bill preview (without finalizing the table)
window.imprimirCuentaActual = function() {
    if (!currentTable) return alert('Selecciona una mesa primero.');
    const ticket = activeTickets.find(t => t.table === currentTable);
    const cartTotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
    const ticketTotal = ticket ? ticket.items.reduce((s, i) => s + i.product.price * i.qty, 0) : 0;
    const grandTotal = cartTotal + ticketTotal;

    const allItems = [];
    if (ticket && ticket.items) allItems.push(...ticket.items);
    allItems.push(...cart);

    const getOrderTitle = (t) => String(t).startsWith('Llevar') || String(t).startsWith('Pedido') ? t : 'Mesa ' + t;
    const preview = buildThermalTicketHtml({
        id: ticket ? ticket.id : 'PREVIO',
        table: getOrderTitle(currentTable),
        waiter: currentUser ? currentUser.name : '',
        items: allItems,
        total: grandTotal,
        abonos: ticket ? (ticket.abonos || []) : [],
        isBillPreview: true
    });
    
    document.getElementById('thermal-ticket-preview').innerHTML = preview;
    currentPrintTicketId = null; // preview only, no finalize
    isReprintMode = false;
    
    const btnCobrar = document.getElementById('btn-modal-cobrar-directo');
    if (btnCobrar) btnCobrar.style.display = 'none';
    const btnPrint = document.getElementById('btn-modal-imprimir');
    if (btnPrint) btnPrint.innerHTML = '<i class="fa-solid fa-print"></i> Imprimir Cuenta';
    
    document.getElementById('ticket-print-modal').classList.add('active');
};

// Prepare and show thermal print preview before finalizing (from cobros)
window.prepararImpresionFinal = function(ticketId) {
    const ticket = activeTickets.find(t => t.id === ticketId);
    if (!ticket) return;
    isReprintMode = false;
    const total = ticket.items.reduce((sum, item) => sum + (item.product.price * item.qty), 0);
    const getOrderTitle = (t) => String(t).startsWith('Llevar') || String(t).startsWith('Pedido') ? t : 'Mesa ' + t;
    const preview = buildThermalTicketHtml({
        id: ticket.id,
        table: getOrderTitle(ticket.table),
        waiter: ticket.waiter,
        items: ticket.items,
        total: total,
        abonos: ticket.abonos || [],
        isBillPreview: false
    });
    document.getElementById('thermal-ticket-preview').innerHTML = preview;
    currentPrintTicketId = ticketId;
    
    // Show Cobrar button so waiter/cashier can charge directly without printing
    const btnCobrar = document.getElementById('btn-modal-cobrar-directo');
    if (btnCobrar) btnCobrar.style.display = 'block';
    const btnPrint = document.getElementById('btn-modal-imprimir');
    if (btnPrint) btnPrint.innerHTML = '<i class="fa-solid fa-print"></i> Imprimir y Cobrar';
    
    document.getElementById('ticket-print-modal').classList.add('active');
};

window.closeTicketPrintModal = function() {
    document.getElementById('ticket-print-modal').classList.remove('active');
    currentPrintTicketId = null;
    isReprintMode = false;
};

// Direct charge without printing
window.ejecutarCobroDirecto = async function() {
    if (!currentPrintTicketId) return;
    const ticketId = currentPrintTicketId;
    currentPrintTicketId = null;
    closeTicketPrintModal();
    await finalizarTicket(ticketId);
};

window.ejecutarImpresionTermica = async function() {
    const preview = document.getElementById('thermal-ticket-preview');
    if (!preview) return;
    
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
    
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ticket</title>
            <style>
                @page { size: 80mm auto; margin: 2mm; }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Courier New', Courier, monospace; font-size: 11pt; width: 76mm; background: white; color: #000; }
                .t-center { text-align: center; }
                .t-bold { font-weight: bold; }
                .t-large { font-size: 14pt; }
                .t-small { font-size: 9pt; }
                .t-muted { color: #555; }
                .divider { border-top: 1px dashed #000; margin: 4px 0; }
                .divider-solid { border-top: 2px solid #000; margin: 4px 0; }
                .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
                .item-name { flex: 1; word-break: break-word; }
                .item-price { min-width: 50px; text-align: right; }
                .notes-line { font-style: italic; color: #555; font-size: 9pt; padding-left: 10px; }
                .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 13pt; margin-top: 3px; }
            </style>
        </head>
        <body>${preview.innerHTML}</body>
        </html>`);
    iframe.contentWindow.document.close();
    
    // If this is a final payment print, finalize the ticket
    if (isReprintMode) {
        closeTicketPrintModal();
    } else if (currentPrintTicketId) {
        const ticketId = currentPrintTicketId;
        currentPrintTicketId = null;
        closeTicketPrintModal();
        await finalizarTicket(ticketId);
    } else {
        closeTicketPrintModal();
    }
    
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
        }, 2000);
    }, 300);
};

async function finalizarTicket(ticketId) {
    await loadDb();
    const ticketIdx = activeTickets.findIndex(t => t.id === ticketId);
    if (ticketIdx === -1) return;
    const ticket = activeTickets[ticketIdx];
    const total = ticket.items.reduce((sum, item) => sum + (item.product.price * item.qty), 0);
    const getOrderTitle = (t) => String(t).startsWith('Llevar') || String(t).startsWith('Pedido') ? t : 'Mesa ' + t;
    
    dailySales.push({
        id: ticket.id,
        table: getOrderTitle(ticket.table),
        items: ticket.items,
        abonos: ticket.abonos || [],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dateObj: new Date().toISOString(),
        itemsCount: ticket.items.reduce((s, it) => s + it.qty, 0),
        total: total,
        waiter: ticket.waiter
    });
    
    activeTickets.splice(ticketIdx, 1);
    await saveDb();
    
    if (ticket.table === currentTable) {
        currentTable = null;
        cart = [];
        renderCart();
    }
    renderCobros();
    renderMesas();
    renderContabilidad();
    showToast('✅ Ticket cobrado y registrado exitosamente', 'success');
}

// Reprint ticket from Daily Sales / Contabilidad
window.reimprimirTicketContabilidad = function(ticketId) {
    const sale = dailySales.find(s => s.id === ticketId);
    if (!sale) return showToast('Ticket no encontrado', 'error');
    
    isReprintMode = true;
    currentPrintTicketId = null;
    
    const items = (sale.items && sale.items.length > 0) ? sale.items : [
        { qty: sale.itemsCount || 1, product: { name: 'Consumo registrado', price: sale.total }, modifiers: [], notes: '' }
    ];
    
    const preview = buildThermalTicketHtml({
        id: sale.id,
        table: sale.table || 'Mesa / Venta',
        waiter: sale.waiter || 'General',
        items: items,
        total: sale.total,
        abonos: sale.abonos || [],
        isBillPreview: false
    });
    
    document.getElementById('thermal-ticket-preview').innerHTML = 
        `<div style="text-align:center; font-weight:bold; margin-bottom:8px; color:#EF4444; border:1px solid #EF4444; padding:4px; font-size:11px;">*** COPIA REIMPRESIÓN ***</div>` + preview;
    
    const btnCobrar = document.getElementById('btn-modal-cobrar-directo');
    if (btnCobrar) btnCobrar.style.display = 'none';
    const btnPrint = document.getElementById('btn-modal-imprimir');
    if (btnPrint) btnPrint.innerHTML = '<i class="fa-solid fa-print"></i> Reimprimir';
    
    document.getElementById('ticket-print-modal').classList.add('active');
};

function buildThermalTicketHtml({ id, table, waiter, items, total, abonos, isBillPreview }) {
    const totalAbonado = (abonos || []).reduce((s, a) => s + a.amount, 0);
    const saldo = total - totalAbonado;
    const now = new Date();
    
    let itemsHtml = items.map(it => {
        const modsLine = it.modifiers && it.modifiers.length > 0
            ? `<div class="notes-line">▶ ${it.modifiers.join(' | ')}</div>` : '';
        const notesLine = it.notes
            ? `<div class="notes-line">💬 ${it.notes}</div>` : '';
        return `
            <div class="row">
                <span class="item-name">${it.qty}x ${it.product.name}</span>
                <span class="item-price">$${(it.qty * it.product.price).toFixed(2)}</span>
            </div>
            ${modsLine}${notesLine}`;
    }).join('');

    let totalsHtml = `<div class="total-row"><span>TOTAL:</span><span>$${total.toFixed(2)}</span></div>`;
    if (totalAbonado > 0) {
        totalsHtml += `
            <div class="row t-small"><span>Abonado:</span><span>-$${totalAbonado.toFixed(2)}</span></div>
            <div class="total-row"><span>SALDO:</span><span>$${saldo.toFixed(2)}</span></div>`;
    }
    
    return `
        <div class="t-center t-bold t-large">RELY</div>
        <div class="t-center t-small">Pozolería, Tacos y Enchiladas</div>
        <div class="t-center t-small">Tel: 123-456-7890</div>
        <div class="divider-solid"></div>
        <div class="t-small">Folio: <strong>${id}</strong></div>
        <div class="t-small">Fecha: ${now.toLocaleDateString('es-MX')} ${now.toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'})}</div>
        <div class="t-small">Atiende: ${waiter}</div>
        <div class="t-small t-bold">Mesa/Cliente: ${table}</div>
        ${isBillPreview ? '<div class="t-center t-small" style="margin:3px 0;">[--- CUENTA PRELIMINAR ---]</div>' : ''}
        <div class="divider"></div>
        ${itemsHtml}
        <div class="divider"></div>
        ${totalsHtml}
        <div class="divider-solid"></div>
        <div class="t-center t-small" style="margin-top: 6px;">¡GRACIAS POR SU PREFERENCIA!</div>
    `;
}

// Toast notification helper
window.showToast = function(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.style.cssText = `padding:12px 20px; border-radius:10px; font-weight:600; font-size:0.9rem; box-shadow:0 4px 15px rgba(0,0,0,0.15); animation:slideInRight 0.3s ease; color:white; background:${type==='success'?'#10B981':type==='error'?'#EF4444':'#2563EB'};`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateX(20px)'; toast.style.transition='all 0.3s'; setTimeout(()=>toast.remove(),350); }, 3000);
};

window.openUserModal = function(user = null) {
    const modal = document.getElementById('user-form-modal');
    if(user) {
        document.getElementById('user-form-title').textContent = 'Editar Usuario';
        document.getElementById('user-form-id').value = user.id;
        document.getElementById('user-form-name').value = user.name;
        document.getElementById('user-form-role').value = user.role;
        document.getElementById('user-form-pin').value = user.pin;
    } else {
        document.getElementById('user-form-title').textContent = 'Nuevo Usuario';
        document.getElementById('user-form-id').value = '';
        document.getElementById('user-form-name').value = '';
        document.getElementById('user-form-role').value = 'mesero';
        document.getElementById('user-form-pin').value = '';
    }
    modal.classList.add('active');
};

window.editUser = function(id) { const u = users.find(x => x.id === id); if(u) window.openUserModal(u); };

window.deleteUser = async function(id) {
    if(confirm('¿Seguro de eliminar este usuario?')) {
        await loadDb();
        users = users.filter(u => u.id !== id);
        await saveDb();
        renderUsersTable(); renderLoginUsers();
    }
};

window.saveUser = async function() {
    const id = document.getElementById('user-form-id').value;
    const name = document.getElementById('user-form-name').value;
    const role = document.getElementById('user-form-role').value;
    const pin = document.getElementById('user-form-pin').value;
    if(!name || pin.length < 4) return alert("Hacen falta datos (PIN 4 dígitos).");
    
    await loadDb();
    if(id) {
        const idx = users.findIndex(u => u.id == id);
        if(idx !== -1) users[idx] = { ...users[idx], name, role, pin };
    } else {
        users.push({ id: Date.now(), name, role, pin });
    }
    await saveDb();
    document.getElementById('user-form-modal').classList.remove('active');
    renderUsersTable(); renderLoginUsers();
};

// --- MENU MANAGEMENT (ADMIN ONLY) ---
function renderMenu() {
    if(!currentUser || currentUser.role !== 'administrador') {
        // Silently return if no user or non-admin to avoid alerts on load
        if(currentView === 'menu') {
             alert("Solo el administrador puede entrar aquí.");
             document.querySelector('.nav-item[data-view="pos"]').click();
        }
        return;
    }
    
    const grid = document.getElementById('menu-management-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        const imageContent = p.image 
            ? `<img src="${p.image}" alt="${p.name}" style="width:100%; height:100%; object-fit:cover;">`
            : `<div class="product-logo"><span class="logo-rely">RELY</span><span class="logo-sub">${p.category}</span></div>`;

        card.innerHTML = `
            <div class="product-price-badge">$${p.price.toFixed(2)}</div>
            <div class="product-image">${imageContent}</div>
            <div class="product-info"><h3>${p.name}</h3></div>
        `;
        card.onclick = () => openMenuEditModal(p);
        grid.appendChild(card);
    });
}

let tempModifiers = [];

window.openMenuEditModal = function(product) {
    document.getElementById('edit-product-id').value = product.id;
    document.getElementById('edit-product-name').value = product.name;
    document.getElementById('edit-product-price').value = product.price;
    document.getElementById('edit-product-category').value = product.category;
    
    const imgObj = document.getElementById('edit-modal-uploaded-image');
    if(product.image) {
        imgObj.src = product.image;
        imgObj.style.display = 'block';
    } else {
        imgObj.style.display = 'none';
    }
    
    tempModifiers = JSON.parse(JSON.stringify(product.modifiers || []));
    renderEditModifiers();
    
    document.getElementById('menu-edit-modal').classList.add('active');
};

function renderEditModifiers() {
    const container = document.getElementById('edit-product-modifiers');
    container.innerHTML = '';
    
    tempModifiers.forEach((mod, modIdx) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'modifier-group';
        groupEl.style.border = '1px solid var(--border)';
        groupEl.style.padding = '10px';
        groupEl.style.borderRadius = '8px';
        groupEl.style.background = '#f8fafc';
        
        groupEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <input type="text" value="${mod.name}" onchange="updateModName(${modIdx}, this.value)" style="font-weight:bold; border:none; background:transparent;">
                <select onchange="updateModType(${modIdx}, this.value)">
                    <option value="radio" ${mod.type === 'radio' ? 'selected' : ''}>Uno (Radio)</option>
                    <option value="checkbox" ${mod.type === 'checkbox' ? 'selected' : ''}>Varios (Check)</option>
                </select>
                <button onclick="removeModGroup(${modIdx})" style="color:var(--danger); border:none; background:transparent;"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div id="choices-${modIdx}" style="display:flex; flex-wrap:wrap; gap:5px;">
                ${mod.choices.map((c, cIdx) => `
                    <div class="modifier-item" style="padding:2px 8px; font-size:0.8rem; background:white; border:1px solid var(--border); border-radius:4px; display:flex; align-items:center;">
                        ${c}
                        <i class="fa-solid fa-times" onclick="removeModChoice(${modIdx}, ${cIdx})" style="margin-left:5px; cursor:pointer; color:var(--text-muted);"></i>
                    </div>
                `).join('')}
                <button onclick="addModChoice(${modIdx})" class="action-btn secondary" style="width:auto; padding:2px 8px; font-size:0.7rem;">+ Opción</button>
            </div>
        `;
        container.appendChild(groupEl);
    });
}

window.updateModName = (idx, val) => { tempModifiers[idx].name = val; };
window.updateModType = (idx, val) => { tempModifiers[idx].type = val; };
window.removeModGroup = (idx) => { tempModifiers.splice(idx, 1); renderEditModifiers(); };
window.addModifierGroup = () => { tempModifiers.push({ name: 'Nueva Opción', type: 'radio', choices: ['Ejemplo'] }); renderEditModifiers(); };
window.removeModChoice = (mIdx, cIdx) => { tempModifiers[mIdx].choices.splice(cIdx, 1); renderEditModifiers(); };
window.addModChoice = (idx) => {
    const val = prompt("Nombre de la opción (ej. Sin cebolla, Con queso):");
    if(val) {
        tempModifiers[idx].choices.push(val);
        renderEditModifiers();
    }
};

const editPhotoUpload = document.getElementById('edit-product-image-upload');
if(editPhotoUpload) {
    editPhotoUpload.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const imgObj = document.getElementById('edit-modal-uploaded-image');
                imgObj.src = event.target.result;
                imgObj.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
}

window.saveProductChanges = async function() {
    const id = document.getElementById('edit-product-id').value;
    const name = document.getElementById('edit-product-name').value.trim();
    const price = parseFloat(document.getElementById('edit-product-price').value);
    const category = document.getElementById('edit-product-category').value;
    const image = document.getElementById('edit-modal-uploaded-image').src;
    
    if(!name || isNaN(price)) return alert("Datos incompletos");
    
    await loadDb();
    const idx = products.findIndex(p => p.id == id);
    if(idx !== -1) {
        products[idx] = {
            ...products[idx],
            name,
            price,
            category,
            image: image.startsWith('data:') ? image : products[idx].image,
            modifiers: tempModifiers
        };
        await saveDb();
        alert("Cambios guardados con éxito.");
        document.getElementById('menu-edit-modal').classList.remove('active');
        renderMenu();
        renderGrid(); // Update POS view too
    }
};

// --- MOBILE NAVIGATION TRAP ---
// Previene que los meseros salgan de la app accidentalmente al usar el gesto 'Atrás' en su celular
window.addEventListener('load', () => {
    history.pushState({ app: true }, '');
});

window.addEventListener('popstate', (e) => {
    let closedSomething = false;

    const modal = document.getElementById('product-modal');
    if (modal && modal.classList.contains('active')) {
        closeModal();
        closedSomething = true;
    }

    const cartSidebar = document.getElementById('cart-sidebar');
    if (cartSidebar && cartSidebar.classList.contains('open')) {
        cartSidebar.classList.remove('open');
        closedSomething = true;
    }
    
    const pinModal = document.getElementById('pin-modal');
    if (pinModal && pinModal.classList.contains('active')) {
        cancelPin();
        closedSomething = true;
    }

    // Always push state back to trap the navigation
    history.pushState({ app: true }, '');
});
