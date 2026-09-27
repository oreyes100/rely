const { getState, saveFullState } = require('../_lib/db');

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
        const { id } = req.body || {};
        if (!id) {
            return res.status(200).json({ success: false, error: 'ID requerido' });
        }

        const state = await getState();
        const users = state.users ? [...state.users] : [];

        // Check if user to delete is the only admin
        const userToDelete = users.find(u => String(u.id) === String(id));
        if (userToDelete && userToDelete.role === 'administrador') {
            const adminCount = users.filter(u => u.role === 'administrador').length;
            if (adminCount <= 1) {
                return res.status(200).json({
                    success: false,
                    error: 'No se puede eliminar el único administrador del sistema.'
                });
            }
        }

        state.users = users.filter(u => String(u.id) !== String(id));
        await saveFullState(state);
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('API /users/delete error:', err);
        return res.status(500).json({ success: false, error: 'Error al eliminar usuario' });
    }
};
