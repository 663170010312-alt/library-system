import { Router } from 'express';
import { pool, positiveId, httpError } from '../db.js';
import { authenticate, allow } from './auth.js';
const router = Router();
router.use(authenticate);
router.get('/', async (req, res) => res.json((await pool.query('SELECT * FROM categories ORDER BY name')).rows));
function categoryName(body) {
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) throw httpError(400, 'กรุณาระบุชื่อหมวดหมู่ไม่เกิน 100 ตัวอักษร');
  return body.name.trim();
}
router.post('/', allow('ADMIN'), async (req, res) => {
  res.status(201).json((await pool.query('INSERT INTO categories(name) VALUES ($1) RETURNING *', [categoryName(req.body)])).rows[0]);
});
router.put('/:id', allow('ADMIN'), async (req, res) => {
  const { rows } = await pool.query('UPDATE categories SET name=$1 WHERE id=$2 RETURNING *', [categoryName(req.body), positiveId(req.params.id)]);
  if (!rows[0]) throw httpError(404, 'ไม่พบหมวดหมู่');
  res.json(rows[0]);
});
router.delete('/:id', allow('ADMIN'), async (req, res) => {
  const result = await pool.query('DELETE FROM categories WHERE id=$1 RETURNING id', [positiveId(req.params.id)]);
  if (!result.rowCount) throw httpError(404, 'ไม่พบหมวดหมู่');
  res.json({ message: 'ลบหมวดหมู่แล้ว' });
});
export default router;
