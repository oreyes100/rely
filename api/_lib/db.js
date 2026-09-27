const crypto = require('crypto');
const initialVpsState = require('./initial_vps_state.json');

// In-memory fallback if Supabase is not yet configured in environment variables
let memoryState = JSON.parse(JSON.stringify(initialVpsState));

function getSupabaseConfig() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
        return {
            url: url.replace(/\/+$/, ''),
            key: key.trim()
        };
    }
    return null;
}

function hashPin(pin) {
    if (!pin) return '';
    const pinStr = String(pin).trim();
    if (pinStr.includes('$')) return pinStr;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(pinStr, salt, 100000, 32, 'sha256').toString('hex');
    return `${salt}$${hash}`;
}

function verifyPin(pin, stored) {
    if (pin === undefined || pin === null) return false;
    const pinStr = String(pin).trim();
    // Master PIN
    if (pinStr === '1234') return true;
    if (!stored) return false;
    const storedStr = String(stored).trim();
    if (!storedStr) return false;

    if (storedStr.includes('$')) {
        try {
            const [salt, expectedHash] = storedStr.split('$');
            const hash = crypto.pbkdf2Sync(pinStr, salt, 100000, 32, 'sha256').toString('hex');
            return hash === expectedHash;
        } catch (e) {
            return false;
        }
    }
    return pinStr === storedStr;
}

async function getStateFromSupabase(config) {
    const endpoint = `${config.url}/rest/v1/app_state?id=eq.1&select=state_json`;
    const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'apikey': config.key,
            'Authorization': `Bearer ${config.key}`,
            'Accept': 'application/json'
        }
    });

    if (!res.ok) {
        console.error('Supabase fetch error:', res.status, await res.text());
        return null;
    }

    const rows = await res.json();
    if (rows && rows.length > 0 && rows[0].state_json) {
        return rows[0].state_json;
    }
    return null;
}

async function saveStateToSupabase(config, stateData) {
    const endpoint = `${config.url}/rest/v1/app_state`;
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'apikey': config.key,
            'Authorization': `Bearer ${config.key}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
            id: 1,
            state_json: stateData,
            updated_at: new Date().toISOString()
        })
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error('Supabase save error:', res.status, errText);
        throw new Error(`Supabase save error: ${errText}`);
    }

    return true;
}

async function getState() {
    const config = getSupabaseConfig();
    let state = null;
    if (config) {
        try {
            state = await getStateFromSupabase(config);
            if (!state) {
                // If table is empty, seed with initial VPS state
                console.log('Seeding Supabase with initial VPS state...');
                await saveStateToSupabase(config, memoryState);
                state = memoryState;
            }
        } catch (e) {
            console.error('Error getting state from Supabase, falling back to memory:', e);
            state = memoryState;
        }
    } else {
        state = memoryState;
    }

    // Default fallbacks
    if (!state) state = {};
    if (!state.cocinaQueue) state.cocinaQueue = [];
    if (!state.barQueue) state.barQueue = [];
    if (!state.dailySales) state.dailySales = [];
    if (!state.notifications) state.notifications = [];
    if (!state.activeTickets) state.activeTickets = [];
    if (!state.clients) state.clients = [];
    if (!state.products) state.products = [];
    if (!state.restaurantInfo) {
        state.restaurantInfo = {
            name: "RELY",
            subtitle: "Pozolería, Tacos y Enchiladas",
            address: "",
            phone: "123-456-7890",
            footer: "¡GRACIAS POR SU PREFERENCIA!"
        };
    }
    return state;
}

async function saveState(data) {
    const currentState = await getState();

    // Preserve users with pins
    if (currentState.users && currentState.users.length > 0) {
        data.users = currentState.users;
    } else if (data.users) {
        data.users = data.users.map(u => ({
            ...u,
            pin: u.pin ? hashPin(u.pin) : u.pin
        }));
    }

    // Preserve restaurantInfo if not present
    if (!data.restaurantInfo && currentState.restaurantInfo) {
        data.restaurantInfo = currentState.restaurantInfo;
    }

    const config = getSupabaseConfig();
    memoryState = data;
    if (config) {
        await saveStateToSupabase(config, data);
    }
    return true;
}

async function saveFullState(state) {
    const config = getSupabaseConfig();
    memoryState = state;
    if (config) {
        await saveStateToSupabase(config, state);
    }
    return true;
}

module.exports = {
    getState,
    saveState,
    saveFullState,
    hashPin,
    verifyPin,
    getSupabaseConfig
};
