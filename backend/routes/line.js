import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';

const router = Router();

const channelSecret =
  process.env.LINE_CHANNEL_SECRET;

const channelAccessToken =
  process.env.LINE_CHANNEL_ACCESS_TOKEN;

const libraryWebUrl =
  process.env.LIBRARY_WEB_URL ||
  'http://localhost:3000';

if (!channelSecret) {
  throw new Error(
    'Missing LINE_CHANNEL_SECRET in backend/.env'
  );
}

if (!channelAccessToken) {
  throw new Error(
    'Missing LINE_CHANNEL_ACCESS_TOKEN in backend/.env'
  );
}


/* =========================================================
   VERIFY LINE SIGNATURE
========================================================= */

function verifySignature(
  rawBody,
  signature
) {
  if (!signature) {
    return false;
  }

  const expected =
    crypto
      .createHmac(
        'sha256',
        channelSecret
      )
      .update(rawBody)
      .digest('base64');

  try {
    const expectedBuffer =
      Buffer.from(expected);

    const signatureBuffer =
      Buffer.from(signature);

    if (
      expectedBuffer.length !==
      signatureBuffer.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      expectedBuffer,
      signatureBuffer
    );
  } catch {
    return false;
  }
}


/* =========================================================
   REPLY MESSAGE
========================================================= */

async function replyMessage(
  replyToken,
  text,
  quickReplyItems = []
) {
  const message = {
    type: 'text',
    text,
  };

  if (quickReplyItems.length) {
    message.quickReply = {
      items: quickReplyItems.map((label) => ({
        type: 'action',
        action: {
          type: 'message',
          label,
          text: label,
        },
      })),
    };
  }

  const response =
    await fetch(
      'https://api.line.me/v2/bot/message/reply',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${channelAccessToken}`,
        },

        body: JSON.stringify({
          replyToken,
          messages: [message],
        }),
      }
    );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `LINE reply failed: ${response.status} ${errorText}`
    );
  }
}


/* =========================================================
   QUICK REPLY MENU
========================================================= */

const mainQuickReply = [
  'ค้นหาหนังสือ',
  'แนะนำหนังสือ',
  'การจองของฉัน',
  'หนังสือที่กำลังยืม',
  'ประวัติการยืม/คืน',
  'รายการเกินกำหนด',
  'เข้าใช้งานเว็บไซต์',
  'เชื่อมบัญชี',
];

const recommendQuickReply = [
  'แนะนำ เขียนโปรแกรม',
  'แนะนำ ฐานข้อมูล',
  'แนะนำ พัฒนาเว็บ',
  'แนะนำ วิทยาศาสตร์',
  'แนะนำ พัฒนาตนเอง',
  'เมนู',
];


/* =========================================================
   SEARCH BOOKS
========================================================= */

async function searchBooks(keyword) {
  const search =
    `%${keyword}%`;

  const { rows } =
    await pool.query(
      `
        SELECT
          b.id,
          b.title,
          b.author,
          b.isbn,
          b.call_number,
          b.price,

          COALESCE(
            c.name,
            'ทั่วไป'
          ) AS category_name,

          (
            SELECT COUNT(*)::int
            FROM book_copies bc
            WHERE
              bc.book_id = b.id
              AND bc.status = 'AVAILABLE'
          ) AS physical_available,

          (
            SELECT COUNT(*)::int
            FROM reservations r
            WHERE
              r.book_id = b.id
              AND r.status = 'PENDING'
              AND r.expires_at > NOW()
          ) AS active_reservations

        FROM books b

        LEFT JOIN categories c
          ON c.id = b.category_id

        WHERE
          b.title ILIKE $1
          OR b.author ILIKE $1
          OR COALESCE(
            b.description,
            ''
          ) ILIKE $1
          OR COALESCE(
            c.name,
            ''
          ) ILIKE $1
          OR COALESCE(
            b.isbn,
            ''
          ) ILIKE $1
          OR COALESCE(
            b.call_number,
            ''
          ) ILIKE $1

        ORDER BY
          CASE
            WHEN b.title ILIKE $2
            THEN 0
            ELSE 1
          END,
          b.title

        LIMIT 5
      `,
      [
        search,
        `${keyword}%`,
      ]
    );

  return rows.map((book) => {
    const physicalAvailable =
      Number(
        book.physical_available || 0
      );

    const activeReservations =
      Number(
        book.active_reservations || 0
      );

    return {
      ...book,

      available_copies:
        Math.max(
          physicalAvailable -
            activeReservations,
          0
        ),
    };
  });
}


/* =========================================================
   FORMAT SEARCH RESULT
========================================================= */

function formatBookSearch(
  books,
  keyword
) {
  if (!books.length) {
    return [
      '🔎 ไม่พบหนังสือ',
      '',
      `คำค้นหา: ${keyword}`,
      '',
      'ลองค้นด้วยชื่อหนังสือ ผู้แต่ง หมวดหมู่ ISBN หรือเลขเรียกหนังสือ',
    ].join('\n');
  }

  const result = [
    `📚 พบ ${books.length} รายการ`,
    '',
  ];

  books.forEach(
    (book, index) => {
      const available =
        Number(
          book.available_copies || 0
        );

      result.push(
        `${index + 1}. ${book.title}`
      );

      result.push(
        `ผู้แต่ง: ${book.author}`
      );

      result.push(
        `หมวดหมู่: ${book.category_name}`
      );

      if (book.call_number) {
        result.push(
          `เลขเรียก: ${book.call_number}`
        );
      }

      if (book.isbn) {
        result.push(
          `ISBN: ${book.isbn}`
        );
      }

      result.push(
        available > 0
          ? `✅ ว่างสำหรับจอง ${available} เล่ม`
          : '❌ ไม่มีหนังสือว่างสำหรับจอง'
      );
      if (available > 0) {
  result.push(
    `ดูรายละเอียด / จอง: ${libraryWebUrl}/books/${book.id}`
  );
}

      if (
        index <
        books.length - 1
      ) {
        result.push('');
      }
    }
  );

  if (books.length === 5) {
    result.push(
      '',
      'แสดงสูงสุด 5 รายการ กรุณาระบุคำค้นหาให้ละเอียดขึ้นหากต้องการ'
    );
  }

  return result.join('\n');
}

/* =========================================================
   LINE ACCOUNT LINK
========================================================= */

async function createLineLinkToken(
  lineUserId
) {
  const token =
    crypto
      .randomBytes(32)
      .toString('hex');

  await pool.query(
    `
      DELETE FROM line_link_tokens
      WHERE
        line_user_id = $1
        AND used_at IS NULL
    `,
    [lineUserId]
  );

  await pool.query(
    `
      INSERT INTO line_link_tokens (
        token,
        line_user_id,
        expires_at
      )
      VALUES (
        $1,
        $2,
        NOW() + INTERVAL '10 minutes'
      )
    `,
    [
      token,
      lineUserId,
    ]
  );

  return token;
}


async function getLinkedAccount(
  lineUserId
) {
  const { rows } =
    await pool.query(
      `
        SELECT
          lal.user_id,
          u.name,
          u.email
        FROM line_account_links lal

        JOIN users u
          ON u.id = lal.user_id

        WHERE
          lal.line_user_id = $1

        LIMIT 1
      `,
      [lineUserId]
    );

  return rows[0] || null;
}

/* =========================================================
   MY RESERVATIONS
========================================================= */

async function getMyReservations(
  userId
) {
  const { rows } =
    await pool.query(
      `
        SELECT
          r.id,
          r.status,
          r.created_at,
          r.expires_at,

          b.id AS book_id,
          b.title,
          b.author,
          b.call_number

        FROM reservations r

        JOIN books b
          ON b.id = r.book_id

        WHERE
          r.user_id = $1

        ORDER BY
          CASE
            WHEN r.status = 'PENDING'
            THEN 0
            ELSE 1
          END,
          r.created_at DESC

        LIMIT 10
      `,
      [userId]
    );

  return rows;
}


function formatMyReservations(
  reservations
) {
  if (!reservations.length) {
    return [
      '📝 การจองของฉัน',
      '',
      'ยังไม่มีรายการจองหนังสือ',
    ].join('\n');
  }


  const result = [
    '📝 การจองของฉัน',
    '',
  ];


  reservations.forEach(
    (reservation, index) => {
      let statusText =
        reservation.status;


      if (
        reservation.status ===
        'PENDING'
      ) {
        statusText =
          '⏳ รอรับที่เคาน์เตอร์';
      }


      if (
        reservation.status ===
        'FULFILLED'
      ) {
        statusText =
          '✅ ยืนยันยืมแล้ว';
      }


      if (
        reservation.status ===
        'CANCELLED'
      ) {
        statusText =
          '❌ ยกเลิกแล้ว';
      }


      if (
        reservation.status ===
        'EXPIRED'
      ) {
        statusText =
          '⌛ หมดอายุ';
      }


      result.push(
        `${index + 1}. ${reservation.title}`
      );


      if (
        reservation.author
      ) {
        result.push(
          `ผู้แต่ง: ${reservation.author}`
        );
      }


      if (
        reservation.call_number
      ) {
        result.push(
          `เลขเรียก: ${reservation.call_number}`
        );
      }


      result.push(
        `สถานะ: ${statusText}`
      );


      if (
        reservation.status ===
        'PENDING'
        &&
        reservation.expires_at
      ) {
        result.push(
          `รับภายใน: ${new Date(
            reservation.expires_at
          ).toLocaleString(
            'th-TH',
            {
              dateStyle:
                'medium',

              timeStyle:
                'short',
            }
          )}`
        );
      }


      if (
        index <
        reservations.length - 1
      ) {
        result.push('');
      }
    }
  );


  return result.join('\n');
}

/* =========================================================
   MY ACTIVE LOANS
========================================================= */

async function getMyActiveLoans(userId) {
  const { rows } =
    await pool.query(
      `
        SELECT
          l.id,
          l.borrowed_at,
          l.due_at,
          l.renewed_until,
          l.renewal_count,

          b.id AS book_id,
          b.title,
          b.author,

          bc.copy_code

        FROM loans l

        JOIN books b
          ON b.id = l.book_id

        LEFT JOIN book_copies bc
          ON bc.id = l.copy_id

        WHERE
          l.user_id = $1
          AND l.returned_at IS NULL

        ORDER BY
          COALESCE(
            l.renewed_until,
            l.due_at
          ) ASC
      `,
      [userId]
    );

  return rows;
}


function formatMyActiveLoans(loans) {
  if (!loans.length) {
    return [
      '📖 หนังสือที่กำลังยืม',
      '',
      'ตอนนี้คุณไม่มีหนังสือที่กำลังยืม',
    ].join('\n');
  }

  const result = [
    '📖 หนังสือที่กำลังยืม',
    '',
  ];

  const now =
    new Date();

  loans.forEach(
    (loan, index) => {
      const effectiveDue =
        loan.renewed_until ||
        loan.due_at;

      const dueDate =
        new Date(
          effectiveDue
        );

      const overdue =
        dueDate.getTime() <
        now.getTime();

      result.push(
        `${index + 1}. ${loan.title}`
      );

      if (loan.author) {
        result.push(
          `ผู้แต่ง: ${loan.author}`
        );
      }

      if (loan.copy_code) {
        result.push(
          `รหัสเล่ม: ${loan.copy_code}`
        );
      }

      result.push(
        `ยืมเมื่อ: ${new Date(
          loan.borrowed_at
        ).toLocaleString(
          'th-TH',
          {
            dateStyle: 'medium',
            timeStyle: 'short',
          }
        )}`
      );

      result.push(
        `กำหนดคืน: ${dueDate.toLocaleString(
          'th-TH',
          {
            dateStyle: 'medium',
            timeStyle: 'short',
          }
        )}`
      );

      if (
        Number(
          loan.renewal_count || 0
        ) > 0
      ) {
        result.push(
          '🔄 ต่ออายุแล้ว'
        );
      }

      result.push(
        overdue
          ? '⚠️ เกินกำหนด'
          : '✅ ยังไม่เกินกำหนด'
      );

      if (
        index <
        loans.length - 1
      ) {
        result.push('');
      }
    }
  );

  return result.join('\n');
}

/* =========================================================
   MY LOAN HISTORY
========================================================= */

async function getMyLoanHistory(userId) {
  const { rows } =
    await pool.query(
      `
        SELECT
          l.id,
          l.borrowed_at,
          l.due_at,
          l.renewed_until,
          l.returned_at,
          l.return_condition,

          b.title,
          b.author,

          bc.copy_code

        FROM loans l

        JOIN books b
          ON b.id = l.book_id

        LEFT JOIN book_copies bc
          ON bc.id = l.copy_id

        WHERE
          l.user_id = $1

        ORDER BY
          l.borrowed_at DESC

        LIMIT 10
      `,
      [userId]
    );

  return rows;
}


function formatMyLoanHistory(loans) {
  if (!loans.length) {
    return [
      '📚 ประวัติการยืม/คืน',
      '',
      'ยังไม่มีประวัติการยืมหนังสือ',
    ].join('\n');
  }

  const result = [
    '📚 ประวัติการยืม/คืน',
    '',
  ];

  loans.forEach(
    (loan, index) => {
      result.push(
        `${index + 1}. ${loan.title}`
      );

      if (loan.author) {
        result.push(
          `ผู้แต่ง: ${loan.author}`
        );
      }

      if (loan.copy_code) {
        result.push(
          `รหัสเล่ม: ${loan.copy_code}`
        );
      }

      result.push(
        `ยืมเมื่อ: ${new Date(
          loan.borrowed_at
        ).toLocaleString(
          'th-TH',
          {
            dateStyle: 'medium',
            timeStyle: 'short',
          }
        )}`
      );

      if (loan.returned_at) {
        result.push(
          `คืนเมื่อ: ${new Date(
            loan.returned_at
          ).toLocaleString(
            'th-TH',
            {
              dateStyle: 'medium',
              timeStyle: 'short',
            }
          )}`
        );

        let conditionText =
          loan.return_condition || 'NORMAL';

        if (
          loan.return_condition ===
          'NORMAL'
        ) {
          conditionText =
            'ปกติ';
        }

        if (
          loan.return_condition ===
          'DAMAGED'
        ) {
          conditionText =
            'ชำรุด';
        }

        if (
          loan.return_condition ===
          'LOST'
        ) {
          conditionText =
            'สูญหาย';
        }

        result.push(
          `สถานะ: ✅ คืนแล้ว (${conditionText})`
        );
      } else {
        const effectiveDue =
          loan.renewed_until ||
          loan.due_at;

        result.push(
          `กำหนดคืน: ${new Date(
            effectiveDue
          ).toLocaleString(
            'th-TH',
            {
              dateStyle: 'medium',
              timeStyle: 'short',
            }
          )}`
        );

        result.push(
          'สถานะ: 📖 กำลังยืม'
        );
      }

      if (
        index <
        loans.length - 1
      ) {
        result.push('');
      }
    }
  );

  return result.join('\n');
}

/* =========================================================
   MY OVERDUE LOANS
========================================================= */

async function getMyOverdueLoans(userId) {
  const { rows } =
    await pool.query(
      `
        SELECT
          l.id,
          l.borrowed_at,
          l.due_at,
          l.renewed_until,
          l.renewal_count,

          b.title,
          b.author,

          bc.copy_code,

          GREATEST(
            0,
            CURRENT_DATE
            -
            COALESCE(
              l.renewed_until,
              l.due_at
            )::date
          )::int AS overdue_days

        FROM loans l

        JOIN books b
          ON b.id = l.book_id

        LEFT JOIN book_copies bc
          ON bc.id = l.copy_id

        WHERE
          l.user_id = $1
          AND l.returned_at IS NULL
          AND COALESCE(
            l.renewed_until,
            l.due_at
          ) < NOW()

        ORDER BY
          COALESCE(
            l.renewed_until,
            l.due_at
          ) ASC
      `,
      [userId]
    );

  return rows;
}


function formatMyOverdueLoans(loans) {
  if (!loans.length) {
    return [
      '⏰ รายการเกินกำหนด',
      '',
      'ไม่มีหนังสือเกินกำหนด ✅',
    ].join('\n');
  }

  const result = [
    '⏰ รายการเกินกำหนด',
    '',
  ];

  loans.forEach(
    (loan, index) => {
      const effectiveDue =
        loan.renewed_until ||
        loan.due_at;

      const overdueDays =
        Number(
          loan.overdue_days || 0
        );

      const estimatedFine =
        overdueDays * 1;

      result.push(
        `${index + 1}. ${loan.title}`
      );

      if (loan.author) {
        result.push(
          `ผู้แต่ง: ${loan.author}`
        );
      }

      if (loan.copy_code) {
        result.push(
          `รหัสเล่ม: ${loan.copy_code}`
        );
      }

      result.push(
        `กำหนดคืน: ${new Date(
          effectiveDue
        ).toLocaleString(
          'th-TH',
          {
            dateStyle: 'medium',
            timeStyle: 'short',
          }
        )}`
      );

      result.push(
        `เกินกำหนด: ${overdueDays} วัน`
      );

      result.push(
        `ค่าปรับโดยประมาณ: ${estimatedFine} บาท`
      );

      if (
        Number(
          loan.renewal_count || 0
        ) > 0
      ) {
        result.push(
          '🔄 รายการนี้เคยต่ออายุแล้ว'
        );
      }

      if (
        index <
        loans.length - 1
      ) {
        result.push('');
      }
    }
  );

  result.push(
    '',
    'หมายเหตุ: ค่าปรับจริงจะยืนยันตอนคืนหนังสือที่เคาน์เตอร์'
  );

  return result.join('\n');
}
/* =========================================================
   HANDLE MESSAGE
========================================================= */

async function handleMessage(event) {
  if (
    event.type !== 'message'
    ||
    event.message?.type !== 'text'
  ) {
    return;
  }

  const originalText =
    String(
      event.message.text || ''
    ).trim();

  const text =
    originalText.toLowerCase();

  console.log(
    'LINE message:',
    originalText
  );


  /* -----------------------------------------
     สวัสดี
  ----------------------------------------- */

  if (
    text === 'สวัสดี'
    ||
    text === 'hello'
    ||
    text === 'hi'
  ) {
    await replyMessage(
      event.replyToken,
      [
        'สวัสดีครับ 👋',
        'ยินดีต้อนรับสู่ระบบห้องสมุดโรงเรียน',
        '',
        'เลือกเมนูด้านล่างได้เลยครับ',
      ].join('\n'),
      mainQuickReply
    );

    return;
  }


  /* -----------------------------------------
     MENU
  ----------------------------------------- */

  if (
    text === 'เมนู'
    ||
    text === 'menu'
  ) {
    await replyMessage(
      event.replyToken,
      [
        '📚 เมนูระบบห้องสมุด',
        '',
        'เลือกเมนูที่ต้องการจากปุ่มด้านล่าง',
        '',
        'หากต้องการจองหนังสือ ระบบจะส่งลิงก์ไปยังเว็บไซต์ห้องสมุด',
      ].join('\n'),
      mainQuickReply
    );

    return;
  }


  /* -----------------------------------------
     ค้นหาหนังสือ
  ----------------------------------------- */

  if (
    text === 'ค้นหาหนังสือ'
    ||
    text === 'ค้นหา'
  ) {
    await replyMessage(
      event.replyToken,
      [
        '🔎 ค้นหาหนังสือ',
        '',
        'พิมพ์คำว่า "ค้นหา" ตามด้วยชื่อหนังสือหรือหัวข้อ',
        '',
        'ตัวอย่าง:',
        'ค้นหา Next.js',
        'ค้นหา JavaScript',
        'ค้นหา PostgreSQL',
      ].join('\n'),
      [
        'แนะนำหนังสือ',
        'เมนู',
      ]
    );

    return;
  }


  /* -----------------------------------------
     SEARCH DATABASE
  ----------------------------------------- */

  if (
    text.startsWith('ค้นหา ')
  ) {
    const keyword =
      originalText
        .slice(
          'ค้นหา '.length
        )
        .trim();

    if (!keyword) {
      await replyMessage(
        event.replyToken,
        'กรุณาระบุชื่อหนังสือที่ต้องการค้นหา'
      );

      return;
    }

    const books =
      await searchBooks(
        keyword
      );

    await replyMessage(
      event.replyToken,
      formatBookSearch(
        books,
        keyword
      ),
      mainQuickReply
    );

    return;
  }


  /* -----------------------------------------
     แนะนำหนังสือ
  ----------------------------------------- */

  if (
    text === 'แนะนำหนังสือ'
  ) {
    await replyMessage(
      event.replyToken,
      [
        '✨ แนะนำหนังสือ',
        '',
        'เลือกหัวข้อที่สนใจจากปุ่มด้านล่าง',
        'หรือพิมพ์ เช่น "แนะนำ พัฒนาเว็บ"',
      ].join('\n'),
      recommendQuickReply
    );

    return;
  }


  if (
    text.startsWith('แนะนำ ')
  ) {
    const keyword =
      originalText
        .slice(
          'แนะนำ '.length
        )
        .trim();

    if (!keyword) {
      await replyMessage(
        event.replyToken,
        'กรุณาระบุหัวข้อที่สนใจ',
        recommendQuickReply
      );

      return;
    }

    const books =
      await searchBooks(
        keyword
      );

    await replyMessage(
      event.replyToken,
      [
        '✨ หนังสือแนะนำ',
        '',
        formatBookSearch(
          books,
          keyword
        ),
      ].join('\n'),
      mainQuickReply
    );

    return;
  }

  /* -----------------------------------------
   เข้าใช้งานเว็บไซต์
----------------------------------------- */

if (
  text === 'เข้าใช้งานเว็บไซต์'
) {
  await replyMessage(
    event.replyToken,
    [
      '🌐 เข้าใช้งานเว็บไซต์ห้องสมุด',
      '',
      'คุณสามารถใช้เว็บไซต์เพื่อ:',
      '• ค้นหาหนังสือ',
      '• ดูรายละเอียดหนังสือ',
      '• จองหนังสือ',
      '• ดูรายการจอง',
      '• ดูประวัติการยืม/คืน',
      '',
      'กดลิงก์ด้านล่างเพื่อเข้าเว็บไซต์:',
      libraryWebUrl,
      '',
      'หากต้องการจองหนังสือ กรุณาเข้าสู่ระบบด้วยบัญชีห้องสมุดก่อน',
    ].join('\n'),
    mainQuickReply
  );

  return;
}
  /* -----------------------------------------
     เชื่อมบัญชี LINE
  ----------------------------------------- */

  if (
    text === 'เชื่อมบัญชี'
  ) {
    const lineUserId =
      event.source?.userId;

    if (!lineUserId) {
      await replyMessage(
        event.replyToken,
        'ไม่สามารถตรวจสอบบัญชี LINE ได้ กรุณาลองใหม่อีกครั้ง',
        mainQuickReply
      );

      return;
    }


    const linkedAccount =
      await getLinkedAccount(
        lineUserId
      );


    if (linkedAccount) {
      await replyMessage(
        event.replyToken,
        [
          '✅ LINE นี้เชื่อมบัญชีห้องสมุดแล้ว',
          '',
          `ชื่อ: ${linkedAccount.name}`,
          '',
          'คุณสามารถใช้เมนูข้อมูลส่วนตัวได้แล้ว',
        ].join('\n'),
        mainQuickReply
      );

      return;
    }


    const token =
      await createLineLinkToken(
        lineUserId
      );

    const link =
      `${libraryWebUrl}/line-link?token=${encodeURIComponent(token)}`;


    await replyMessage(
      event.replyToken,
      [
        '🔗 เชื่อมบัญชีห้องสมุด',
        '',
        'กดลิงก์ด้านล่างเพื่อเชื่อมบัญชีสมาชิกของคุณกับ LINE',
        '',
        link,
        '',
        '⏱️ ลิงก์นี้มีอายุ 10 นาที',
        'และสามารถใช้ได้เพียงครั้งเดียว',
      ].join('\n'),
      mainQuickReply
    );

    return;
  }
  /* -----------------------------------------
     เมนูข้อมูลส่วนตัว
     ตอนนี้ยังไม่ได้เชื่อม LINE กับ USER
  ----------------------------------------- */

 /* -----------------------------------------
   เมนูข้อมูลส่วนตัว
----------------------------------------- */

/* -----------------------------------------
   การจองของฉัน
----------------------------------------- */
  /* -----------------------------------------
     การจองของฉัน
  ----------------------------------------- */

  if (
    text === 'การจองของฉัน'
  ) {
    const lineUserId =
      event.source?.userId;


    if (!lineUserId) {
      await replyMessage(
        event.replyToken,
        'ไม่สามารถตรวจสอบบัญชี LINE ได้',
        mainQuickReply
      );

      return;
    }


    const linkedAccount =
      await getLinkedAccount(
        lineUserId
      );


    if (!linkedAccount) {
      await replyMessage(
        event.replyToken,
        [
          '🔐 ยังไม่ได้เชื่อมบัญชีสมาชิกกับ LINE',
          '',
          'กรุณากด "เชื่อมบัญชี" ก่อนใช้งานเมนูนี้',
        ].join('\n'),
        mainQuickReply
      );

      return;
    }


    const reservations =
      await getMyReservations(
        linkedAccount.user_id
      );


    await replyMessage(
      event.replyToken,
      formatMyReservations(
        reservations
      ),
      mainQuickReply
    );


    return;
  }


  /* -----------------------------------------
     เมนูข้อมูลส่วนตัวอื่น ๆ
  ----------------------------------------- */

  /* -----------------------------------------
   หนังสือที่กำลังยืม
----------------------------------------- */

if (
  text === 'หนังสือที่กำลังยืม'
) {
  const lineUserId =
    event.source?.userId;

  if (!lineUserId) {
    await replyMessage(
      event.replyToken,
      'ไม่สามารถตรวจสอบบัญชี LINE ได้',
      mainQuickReply
    );

    return;
  }

  const linkedAccount =
    await getLinkedAccount(
      lineUserId
    );

  if (!linkedAccount) {
    await replyMessage(
      event.replyToken,
      [
        '🔐 ยังไม่ได้เชื่อมบัญชีสมาชิกกับ LINE',
        '',
        'กรุณากด "เชื่อมบัญชี" ก่อนใช้งานเมนูนี้',
      ].join('\n'),
      mainQuickReply
    );

    return;
  }

  const loans =
    await getMyActiveLoans(
      linkedAccount.user_id
    );

  await replyMessage(
    event.replyToken,
    formatMyActiveLoans(
      loans
    ),
    mainQuickReply
  );

  return;
}

   /* -----------------------------------------
   ประวัติการยืม/คืน
----------------------------------------- */

if (
  text === 'ประวัติการยืม/คืน'
) {
  const lineUserId =
    event.source?.userId;

  if (!lineUserId) {
    await replyMessage(
      event.replyToken,
      'ไม่สามารถตรวจสอบบัญชี LINE ได้',
      mainQuickReply
    );

    return;
  }

  const linkedAccount =
    await getLinkedAccount(
      lineUserId
    );

  if (!linkedAccount) {
    await replyMessage(
      event.replyToken,
      [
        '🔐 ยังไม่ได้เชื่อมบัญชีสมาชิกกับ LINE',
        '',
        'กรุณากด "เชื่อมบัญชี" ก่อนใช้งานเมนูนี้',
      ].join('\n'),
      mainQuickReply
    );

    return;
  }

  const loans =
    await getMyLoanHistory(
      linkedAccount.user_id
    );

  await replyMessage(
    event.replyToken,
    formatMyLoanHistory(
      loans
    ),
    mainQuickReply
  );

  return;
}
/* -----------------------------------------
   รายการเกินกำหนด
----------------------------------------- */

if (
  text === 'รายการเกินกำหนด'
) {
  const lineUserId =
    event.source?.userId;

  if (!lineUserId) {
    await replyMessage(
      event.replyToken,
      'ไม่สามารถตรวจสอบบัญชี LINE ได้',
      mainQuickReply
    );

    return;
  }

  const linkedAccount =
    await getLinkedAccount(
      lineUserId
    );

  if (!linkedAccount) {
    await replyMessage(
      event.replyToken,
      [
        '🔐 ยังไม่ได้เชื่อมบัญชีสมาชิกกับ LINE',
        '',
        'กรุณากด "เชื่อมบัญชี" ก่อนใช้งานเมนูนี้',
      ].join('\n'),
      mainQuickReply
    );

    return;
  }

  const overdueLoans =
    await getMyOverdueLoans(
      linkedAccount.user_id
    );

  await replyMessage(
    event.replyToken,
    formatMyOverdueLoans(
      overdueLoans
    ),
    mainQuickReply
  );

  return;
}
   {
    const lineUserId =
      event.source?.userId;


    if (!lineUserId) {
      await replyMessage(
        event.replyToken,
        'ไม่สามารถตรวจสอบบัญชี LINE ได้',
        mainQuickReply
      );

      return;
    }


    const linkedAccount =
      await getLinkedAccount(
        lineUserId
      );


    if (!linkedAccount) {
      await replyMessage(
        event.replyToken,
        [
          '🔐 ยังไม่ได้เชื่อมบัญชีสมาชิกกับ LINE',
          '',
          'กรุณากด "เชื่อมบัญชี" ก่อนใช้งานเมนูนี้',
        ].join('\n'),
        mainQuickReply
      );

      return;
    }


    await replyMessage(
      event.replyToken,
      [
        '✅ ตรวจพบบัญชีสมาชิกแล้ว',
        '',
        `ชื่อ: ${linkedAccount.name}`,
        '',
        `เมนูที่เลือก: ${originalText}`,
        '',
        'กำลังพัฒนาเมนูนี้ต่อ',
      ].join('\n'),
      mainQuickReply
    );


    return;
  }


  /* -----------------------------------------
     DEFAULT
  ----------------------------------------- */

  await replyMessage(
    event.replyToken,
    [
      'ไม่พบคำสั่งที่ต้องการ',
      '',
      'เลือกเมนูด้านล่างได้เลยครับ',
    ].join('\n'),
    mainQuickReply
  );

} // ปิด handleMessage(event)


/* =========================================================
   LINE WEBHOOK
========================================================= */


/* =========================================================
   LINE WEBHOOK
========================================================= */

router.post(
  '/webhook',
  async (req, res, next) => {
    try {
      const rawBody =
        req.body;

      const signature =
        req.get(
          'x-line-signature'
        );

      if (
        !Buffer.isBuffer(
          rawBody
        )
      ) {
        return res
          .status(400)
          .send(
            'Webhook body must be raw'
          );
      }


      if (
        !verifySignature(
          rawBody,
          signature
        )
      ) {
        console.warn(
          'Invalid LINE signature'
        );

        return res
          .sendStatus(401);
      }


      const body =
        JSON.parse(
          rawBody.toString(
            'utf8'
          )
        );


      console.log(
        '=== LINE WEBHOOK ==='
      );

      console.log(
        JSON.stringify(
          body,
          null,
          2
        )
      );


      /*
        ตอบ LINE ทันที
      */

      res.sendStatus(200);


      /*
        ประมวลผล Event
      */

      for (
        const event of
        body.events || []
      ) {
        try {
          await handleMessage(
            event
          );

        } catch (error) {
          console.error(
            'LINE event error:',
            error
          );
        }
      }

    } catch (error) {
      next(error);
    }
  }
);


export default router;