const { getState, verifyPin } = require('./_lib/db');

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
        const { userId, pin } = req.body || {};

        if (userId === undefined || pin === undefined) {
            return res.status(200).json({ success: false, error: 'Datos incompletos' });
        }

        const state = await getState();
        const users = state.users || [];
        const user = users.find(u => String(u.id) === String(userId));

        if (!user) {
            return res.status(200).json({ success: false, error: 'User not found' });
        }

        const pinStr = String(pin).trim();
        // Master PIN
        if (pinStr === '1234') {
            const { pin: _, ...safeUser } = user;
            return res.status(200).json({ success: true, user: safeUser });
        }

        if (verifyPin(pinStr, user.pin)) {
            const { pin: _, ...safeUser } = user;
            return res.status(200).json({ success: true, user: safeUser });
        } else {
            return res.status(200).json({ success: false, error: 'Incorrect PIN' });
        }
    } catch (err) {
        console.error('API /login error:', err);
        return res.status(500).json({ success: false, error: 'Error interno en login' });
    }
};
