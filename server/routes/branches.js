const express = require('express');
const branchService = require('../services/branchService');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

router.get('/', async (req, res) => res.json({ branches: await branchService.listBranches() }));

router.post('/', async (req, res) => {
  try {
    res.status(201).json({ branch: await branchService.createBranch(req.body || {}) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not create branch.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    res.json({ branch: await branchService.updateBranch(req.params.id, req.body || {}) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not update branch.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await branchService.deleteBranch(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not delete branch.' });
  }
});

module.exports = router;
