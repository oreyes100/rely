const { getState, saveState } = require('./_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const state = await getState();
            // Clone state to not mutate stored users
            const safeState = JSON.parse(JSON.stringify(state));
            if (safeState.users && Array.isArray(safeState.users)) {
                safeState.users = safeState.users.map(u => {
                    const { pin, ...safeUser } = u;
                    return safeUser;
                });
            }
            return res.status(200).json(safeState);
        }

        if (req.method === 'POST') {
            const data = req.body;
            if (!data || typeof data !== 'object') {
                return res.status(400).json({ error: 'Invalid JSON body' });
            }
            await saveState(data);
            return res.status(200).json({ status: 'ok' });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('API /state error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
};
