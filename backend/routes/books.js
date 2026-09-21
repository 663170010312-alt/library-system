import { Router } from 'express';
import {
  pool,
  positiveId,
  httpError,
} from '../db.js';

import {
  authenticate,
  allow,
} from './auth.js';

const router = Router();

router.use(authenticate);


/* =========================================================
   GET ALL BOOKS
========================================================= */

router.get('/', async (req, res) => {
  const search =
    typeof req.query.search === 'string'
      ? req.query.search.trim()
      : '';

  const categoryId =
    req.query.category_id
      ? positiveId(req.query.category_id)
      : null;

  const values = [];
  const conditions = [];

  if (search) {
    values.push(`%${search}%`);

    conditions.push(`
      (
        b.title ILIKE $${values.length}
        OR b.author ILIKE $${values.length}
        OR b.isbn ILIKE $${values.length}
        OR b.call_number ILIKE $${values.length}
      )
    `);
  }

  if (categoryId) {
    values.push(categoryId);

    conditions.push(`
      b.category_id = $${values.length}
    `);
  }

  const where =
    conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

  const { rows } =
    await pool.query(
      `
        SELECT
          b.id,
          b.title,
          b.author,
          b.isbn,
          b.call_number,
          b.description,
          b.price,
          b.cover_url,

          b.category_id,
          c.name AS category_name,

          b.total_copies,

          COUNT(
            bc.id
          ) FILTER (
            WHERE bc.status IN (
              'AVAILABLE',
              'BORROWED'
            )
          )::int AS copy_count,

          COUNT(
            bc.id
          ) FILTER (
            WHERE bc.status = 'AVAILABLE'
          )::int AS available_copies,

          COUNT(
            bc.id
          ) FILTER (
            WHERE bc.status = 'BORROWED'
          )::int AS borrowed_copies,

          COUNT(
            bc.id
          ) FILTER (
            WHERE bc.status = 'LOST'
          )::int AS lost_copies

        FROM books b

        LEFT JOIN categories c
          ON c.id = b.category_id

        LEFT JOIN book_copies bc
          ON bc.book_id = b.id

        ${where}

        GROUP BY
          b.id,
          c.name

        ORDER BY
          b.id DESC
      `,
      values
    );

  res.json(rows);
});


/* =========================================================
   GET ONE BOOK
========================================================= */

router.get('/:id', async (req, res) => {
  const id =
    positiveId(req.params.id);

  const bookResult =
    await pool.query(
      `
        SELECT
          b.id,
          b.title,
          b.author,
          b.isbn,
          b.call_number,
          b.description,
          b.price,
          b.cover_url,

          b.category_id,
          c.name AS category_name,

          b.total_copies,

          COUNT(
            bc.id
          ) FILTER (
            WHERE bc.status IN (
              'AVAILABLE',
              'BORROWED'
            )
          )::int AS copy_count,

          COUNT(
            bc.id
          ) FILTER (
            WHERE bc.status = 'AVAILABLE'
          )::int AS available_copies,

          COUNT(
            bc.id
          ) FILTER (
            WHERE bc.status = 'BORROWED'
          )::int AS borrowed_copies,

          COUNT(
            bc.id
          ) FILTER (
            WHERE bc.status = 'LOST'
          )::int AS lost_copies

        FROM books b

        LEFT JOIN categories c
          ON c.id = b.category_id

        LEFT JOIN book_copies bc
          ON bc.book_id = b.id

        WHERE b.id = $1

        GROUP BY
          b.id,
          c.name
      `,
      [id]
    );

  const book =
    bookResult.rows[0];

  if (!book) {
    throw httpError(
      404,
      'ไม่พบหนังสือ'
    );
  }

  const copiesResult =
    await pool.query(
      `
        SELECT
          bc.id,
          bc.book_id,
          bc.copy_code,
          bc.status,
          bc.created_at

        FROM book_copies bc

        WHERE bc.book_id = $1

        ORDER BY bc.id
      `,
      [id]
    );

  res.json({
    ...book,
    copies: copiesResult.rows,
  });
});


/* =========================================================
   CREATE BOOK TITLE + COPIES
========================================================= */

router.post(
  '/',
  allow('ADMIN'),
  async (req, res) => {
    const {
      title,
      author,
      isbn,
      call_number,
      description,
      price,
      cover_url,
      category_id,
      total_copies,
    } = req.body;

    if (
      typeof title !== 'string' ||
      !title.trim() ||
      title.trim().length > 255
    ) {
      throw httpError(
        400,
        'กรุณาระบุชื่อหนังสือ'
      );
    }

    if (
      typeof author !== 'string' ||
      !author.trim() ||
      author.trim().length > 255
    ) {
      throw httpError(
        400,
        'กรุณาระบุชื่อผู้แต่ง'
      );
    }

    const copies =
      Number(total_copies);

    if (
      !Number.isSafeInteger(copies) ||
      copies < 1 ||
      copies > 1000
    ) {
      throw httpError(
        400,
        'จำนวนหนังสือต้องเป็นจำนวนเต็มอย่างน้อย 1 เล่ม'
      );
    }

    const numericPrice =
      Number(price || 0);

    if (
      !Number.isFinite(numericPrice) ||
      numericPrice < 0
    ) {
      throw httpError(
        400,
        'ราคาหนังสือไม่ถูกต้อง'
      );
    }

    const categoryId =
      category_id
        ? positiveId(category_id)
        : null;

    const client =
      await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } =
        await client.query(
          `
            INSERT INTO books(
              title,
              author,
              isbn,
              call_number,
              description,
              price,
              cover_url,
              category_id,
              total_copies
            )

            VALUES(
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9
            )

            RETURNING *
          `,
          [
            title.trim(),
            author.trim(),
            isbn?.trim() || null,
            call_number?.trim() || null,
            description?.trim() || null,
            numericPrice,
            cover_url?.trim() || null,
            categoryId,
            copies,
          ]
        );

      const book =
        rows[0];

      for (
        let i = 0;
        i < copies;
        i++
      ) {
        const copyResult =
          await client.query(
            `
              INSERT INTO book_copies(
                book_id,
                status
              )

              VALUES(
                $1,
                'AVAILABLE'
              )

              RETURNING id
            `,
            [book.id]
          );

        const copyId =
          copyResult.rows[0].id;

        await client.query(
          `
            UPDATE book_copies

            SET copy_code =
              'COPY-' ||
              LPAD(
                id::text,
                6,
                '0'
              )

            WHERE id = $1
          `,
          [copyId]
        );
      }

      await client.query('COMMIT');

      const created =
        await pool.query(
          `
            SELECT
              b.*,

              COUNT(
                bc.id
              )::int AS copy_count,

              COUNT(
                bc.id
              ) FILTER (
                WHERE bc.status = 'AVAILABLE'
              )::int AS available_copies

            FROM books b

            LEFT JOIN book_copies bc
              ON bc.book_id = b.id

            WHERE b.id = $1

            GROUP BY b.id
          `,
          [book.id]
        );

      res
        .status(201)
        .json(
          created.rows[0]
        );

    } catch (error) {
      await client.query(
        'ROLLBACK'
      );

      throw error;

    } finally {
      client.release();
    }
  }
);


/* =========================================================
   UPDATE BOOK TITLE
========================================================= */

router.put(
  '/:id',
  allow('ADMIN'),
  async (req, res) => {
    const id =
      positiveId(req.params.id);

    const existing =
      (
        await pool.query(
          `
            SELECT *
            FROM books
            WHERE id = $1
          `,
          [id]
        )
      ).rows[0];

    if (!existing) {
      throw httpError(
        404,
        'ไม่พบหนังสือ'
      );
    }

    const {
      title,
      author,
      isbn,
      call_number,
      description,
      price,
      cover_url,
      category_id,
      total_copies,
    } = req.body;

    if (
      typeof title !== 'string' ||
      !title.trim()
    ) {
      throw httpError(
        400,
        'กรุณาระบุชื่อหนังสือ'
      );
    }

    if (
      typeof author !== 'string' ||
      !author.trim()
    ) {
      throw httpError(
        400,
        'กรุณาระบุชื่อผู้แต่ง'
      );
    }

    const numericPrice =
      Number(price || 0);

    if (
      !Number.isFinite(numericPrice) ||
      numericPrice < 0
    ) {
      throw httpError(
        400,
        'ราคาหนังสือไม่ถูกต้อง'
      );
    }

    const wantedCopies =
      Number(total_copies);

    if (
      !Number.isSafeInteger(
        wantedCopies
      ) ||
      wantedCopies < 1 ||
      wantedCopies > 1000
    ) {
      throw httpError(
        400,
        'จำนวนหนังสือต้องเป็นจำนวนเต็มอย่างน้อย 1 เล่ม'
      );
    }

    const categoryId =
      category_id
        ? positiveId(category_id)
        : null;

    const client =
      await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `
          UPDATE books

          SET
            title = $1,
            author = $2,
            isbn = $3,
            call_number = $4,
            description = $5,
            price = $6,
            cover_url = $7,
            category_id = $8

          WHERE id = $9
        `,
        [
          title.trim(),
          author.trim(),
          isbn?.trim() || null,
          call_number?.trim() || null,
          description?.trim() || null,
          numericPrice,
          cover_url?.trim() || null,
          categoryId,
          id,
        ]
      );

      const copies =
        await client.query(
          `
            SELECT
              id,
              status

            FROM book_copies

            WHERE book_id = $1

            ORDER BY id
          `,
          [id]
        );

      const activeCopies =
        copies.rows.filter(
          (copy) =>
            copy.status !==
            'RETIRED'
        );

      const currentCount =
        activeCopies.length;

      if (
        wantedCopies >
        currentCount
      ) {
        const addCount =
          wantedCopies -
          currentCount;

        for (
          let i = 0;
          i < addCount;
          i++
        ) {
          const result =
            await client.query(
              `
                INSERT INTO book_copies(
                  book_id,
                  status
                )

                VALUES(
                  $1,
                  'AVAILABLE'
                )

                RETURNING id
              `,
              [id]
            );

          await client.query(
            `
              UPDATE book_copies

              SET copy_code =
                'COPY-' ||
                LPAD(
                  id::text,
                  6,
                  '0'
                )

              WHERE id = $1
            `,
            [
              result.rows[0].id,
            ]
          );
        }
      }

      if (
        wantedCopies <
        currentCount
      ) {
        const removeCount =
          currentCount -
          wantedCopies;

        const removable =
          await client.query(
            `
              SELECT id

              FROM book_copies

              WHERE
                book_id = $1
                AND status = 'AVAILABLE'

              ORDER BY id DESC

              LIMIT $2
            `,
            [
              id,
              removeCount,
            ]
          );

        if (
          removable.rowCount <
          removeCount
        ) {
          throw httpError(
            409,
            'ไม่สามารถลดจำนวนหนังสือได้ เพราะมีบางเล่มกำลังถูกยืมอยู่'
          );
        }

        for (
          const copy of
          removable.rows
        ) {
          await client.query(
            `
              UPDATE book_copies

              SET status = 'RETIRED'

              WHERE id = $1
            `,
            [copy.id]
          );
        }
      }

      await client.query(
        `
          UPDATE books b

          SET total_copies = (
            SELECT COUNT(*)::int

            FROM book_copies bc

            WHERE
              bc.book_id = b.id
              AND bc.status IN (
                'AVAILABLE',
                'BORROWED'
              )
          )

          WHERE b.id = $1
        `,
        [id]
      );

      await client.query(
        'COMMIT'
      );

      const { rows } =
        await pool.query(
          `
            SELECT
              b.*,

              COUNT(
                bc.id
              ) FILTER (
                WHERE bc.status IN (
                  'AVAILABLE',
                  'BORROWED'
                )
              )::int AS copy_count,

              COUNT(
                bc.id
              ) FILTER (
                WHERE bc.status =
                  'AVAILABLE'
              )::int AS available_copies

            FROM books b

            LEFT JOIN book_copies bc
              ON bc.book_id = b.id

            WHERE b.id = $1

            GROUP BY b.id
          `,
          [id]
        );

      res.json(rows[0]);

    } catch (error) {
      await client.query(
        'ROLLBACK'
      );

      throw error;

    } finally {
      client.release();
    }
  }
);


/* =========================================================
   DELETE BOOK
========================================================= */

router.delete(
  '/:id',
  allow('ADMIN'),
  async (req, res) => {
    const id =
      positiveId(req.params.id);

    const activeLoan =
      await pool.query(
        `
          SELECT l.id

          FROM loans l

          WHERE
            l.book_id = $1
            AND l.returned_at IS NULL

          LIMIT 1
        `,
        [id]
      );

    if (activeLoan.rowCount) {
      throw httpError(
        409,
        'ไม่สามารถลบหนังสือที่กำลังถูกยืมอยู่ได้'
      );
    }

    const reservation =
      await pool.query(
        `
          SELECT id

          FROM reservations

          WHERE
            book_id = $1
            AND status = 'PENDING'
            AND expires_at > NOW()

          LIMIT 1
        `,
        [id]
      );

    if (reservation.rowCount) {
      throw httpError(
        409,
        'ไม่สามารถลบหนังสือที่มีการจองอยู่ได้'
      );
    }

    const { rows } =
      await pool.query(
        `
          DELETE FROM books

          WHERE id = $1

          RETURNING id
        `,
        [id]
      );

    if (!rows[0]) {
      throw httpError(
        404,
        'ไม่พบหนังสือ'
      );
    }

    res.json({
      message:
        'ลบหนังสือแล้ว',
    });
  }
);

export default router;