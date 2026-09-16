const express = require('express');
const branchService = require('../services/branchService');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

router.get('/', (req, res) => res.json({ branches: branchService.listBranches() }));

router.post('/', (req, res) => {
  try {
    res.status(201).json({ branch: branchService.createBranch(req.body || {}) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not create branch.' });
  }
});

router.put('/:id', (req, res) => {
  try {
    res.json({ branch: branchService.updateBranch(req.params.id, req.body || {}) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not update branch.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    branchService.deleteBranch(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not delete branch.' });
  }
});

module.exports = router;
