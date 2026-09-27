const { getState, saveFullState, hashPin } = require('../_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { id, name, role, pin } = req.body || {};

        if (!name || !String(name).trim()) {
            return res.status(200).json({ success: false, error: 'El nombre es obligatorio' });
        }

        const trimmedName = String(name).trim();
        const userRole = role ? String(role).trim() : 'mesero';

        const state = await getState();
        const users = state.users ? [...state.users] : [];

        if (id) {
            // Update existing user
            const idx = users.findIndex(u => String(u.id) === String(id));
            if (idx !== -1) {
                users[idx].name = trimmedName;
                users[idx].role = userRole;
                if (pin && String(pin).trim()) {
                    users[idx].pin = hashPin(pin);
                }
            } else {
                return res.status(200).json({ success: false, error: 'Usuario no encontrado' });
            }
        } else {
            // New user
            if (!pin || String(pin).trim().length < 4) {
                return res.status(200).json({ success: false, error: 'El PIN debe tener al menos 4 dígitos' });
            }
            const existingIds = users
                .map(u => parseInt(u.id, 10))
                .filter(num => !isNaN(num));
            const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

            users.push({
                id: newId,
                name: trimmedName,
                role: userRole,
                pin: hashPin(pin)
            });
        }

        state.users = users;
        await saveFullState(state);
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('API /users/save error:', err);
        return res.status(500).json({ success: false, error: 'Error al guardar usuario' });
    }
};
