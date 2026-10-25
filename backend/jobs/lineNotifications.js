import { pool } from '../db.js';

const LINE_CHANNEL_ACCESS_TOKEN =
  process.env.LINE_CHANNEL_ACCESS_TOKEN;

const LINE_PUSH_URL =
  'https://api.line.me/v2/bot/message/push';


/* =========================================================
   HELPERS
========================================================= */

function thaiDate(value) {
  if (!value) return '-';

  return new Intl.DateTimeFormat(
    'th-TH',
    {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }
  ).format(new Date(value));
}


async function pushLine(lineUserId, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error(
      'Missing LINE_CHANNEL_ACCESS_TOKEN'
    );
  }

  const response = await fetch(
    LINE_PUSH_URL,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',

        Authorization:
          `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },

      body: JSON.stringify({
        to: lineUserId,

        messages: [
          {
            type: 'text',
            text,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `LINE push failed ${response.status}: ${body}`
    );
  }
}


async function hasLoanLog(
  loanId,
  notificationType
) {
  const { rowCount } = await pool.query(
    `
      SELECT 1

      FROM notification_logs

      WHERE loan_id = $1

        AND notification_type = $2

        AND notification_date =
          (
            NOW()
            AT TIME ZONE 'Asia/Bangkok'
          )::date

      LIMIT 1
    `,
    [
      loanId,
      notificationType,
    ]
  );

  return rowCount > 0;
}


async function addLoanLog(
  userId,
  loanId,
  notificationType
) {
  await pool.query(
    `
      INSERT INTO notification_logs(
        user_id,
        loan_id,
        notification_type,
        notification_date
      )

      VALUES(
        $1,
        $2,
        $3,
        (
          NOW()
          AT TIME ZONE 'Asia/Bangkok'
        )::date
      )

      ON CONFLICT DO NOTHING
    `,
    [
      userId,
      loanId,
      notificationType,
    ]
  );
}


async function hasReservationLog(
  reservationId,
  notificationType
) {
  const { rowCount } = await pool.query(
    `
      SELECT 1

      FROM notification_logs

      WHERE reservation_id = $1

        AND notification_type = $2

        AND notification_date =
          (
            NOW()
            AT TIME ZONE 'Asia/Bangkok'
          )::date

      LIMIT 1
    `,
    [
      reservationId,
      notificationType,
    ]
  );

  return rowCount > 0;
}


async function addReservationLog(
  userId,
  reservationId,
  notificationType
) {
  await pool.query(
    `
      INSERT INTO notification_logs(
        user_id,
        reservation_id,
        notification_type,
        notification_date
      )

      VALUES(
        $1,
        $2,
        $3,
        (
          NOW()
          AT TIME ZONE 'Asia/Bangkok'
        )::date
      )

      ON CONFLICT DO NOTHING
    `,
    [
      userId,
      reservationId,
      notificationType,
    ]
  );
}


/* =========================================================
   RESERVATION CREATED
========================================================= */

export async function notifyReservationCreated(
  reservationId
) {
  const { rows } = await pool.query(
    `
      SELECT
        r.id,
        r.user_id,
        r.expires_at,

        b.title,

        lal.line_user_id

      FROM reservations r

      JOIN books b
        ON b.id = r.book_id

      JOIN line_account_links lal
        ON lal.user_id = r.user_id

      WHERE r.id = $1

      LIMIT 1
    `,
    [reservationId]
  );

  const reservation = rows[0];

  if (!reservation) {
    return false;
  }

  if (
    await hasReservationLog(
      reservation.id,
      'RESERVATION_CREATED'
    )
  ) {
    return false;
  }

  const text =
`✅ จองหนังสือสำเร็จ

หนังสือ: ${reservation.title}
รับหนังสือภายใน: ${thaiDate(
  reservation.expires_at
)}

กรุณามารับหนังสือภายในระยะเวลาที่กำหนด`;

  await pushLine(
    reservation.line_user_id,
    text
  );

  await addReservationLog(
    reservation.user_id,
    reservation.id,
    'RESERVATION_CREATED'
  );

  return true;
}


/* =========================================================
   LOAN CREATED
========================================================= */

export async function notifyLoanCreated(
  loanId
) {
  const { rows } = await pool.query(
    `
      SELECT
        l.id,
        l.user_id,
        l.borrowed_at,
        l.due_at,

        b.title,

        bc.copy_code,

        lal.line_user_id

      FROM loans l

      JOIN books b
        ON b.id = l.book_id

      LEFT JOIN book_copies bc
        ON bc.id = l.copy_id

      JOIN line_account_links lal
        ON lal.user_id = l.user_id

      WHERE l.id = $1

      LIMIT 1
    `,
    [loanId]
  );

  const loan = rows[0];

  if (!loan) {
    return false;
  }

  if (
    await hasLoanLog(
      loan.id,
      'LOAN_CREATED'
    )
  ) {
    return false;
  }

  const text =
`📚 ยืมหนังสือสำเร็จ

หนังสือ: ${loan.title}
รหัสเล่ม: ${loan.copy_code || '-'}
วันที่ยืม: ${thaiDate(loan.borrowed_at)}
กำหนดคืน: ${thaiDate(loan.due_at)}`;

  await pushLine(
    loan.line_user_id,
    text
  );

  await addLoanLog(
    loan.user_id,
    loan.id,
    'LOAN_CREATED'
  );

  return true;
}


/* =========================================================
   RETURN COMPLETED
========================================================= */

export async function notifyReturnCompleted(
  loanId
) {
  const { rows } = await pool.query(
    `
      SELECT
        l.id,
        l.user_id,
        l.returned_at,
        l.return_condition,
        l.late_fee,
        l.damage_fee,
        l.lost_fee,
        l.total_fine,

        b.title,

        bc.copy_code,

        lal.line_user_id

      FROM loans l

      JOIN books b
        ON b.id = l.book_id

      LEFT JOIN book_copies bc
        ON bc.id = l.copy_id

      JOIN line_account_links lal
        ON lal.user_id = l.user_id

      WHERE l.id = $1

      LIMIT 1
    `,
    [loanId]
  );

  const loan = rows[0];

  if (!loan) {
    return false;
  }

  if (
    await hasLoanLog(
      loan.id,
      'RETURN_COMPLETED'
    )
  ) {
    return false;
  }

 const fineItems = [];

if (Number(loan.late_fee || 0) > 0) {
  fineItems.push(
    `ค่าปรับคืนล่าช้า: ${Number(loan.late_fee).toFixed(2)} บาท`
  );
}

if (Number(loan.damage_fee || 0) > 0) {
  fineItems.push(
    `ค่าปรับหนังสือชำรุด: ${Number(loan.damage_fee).toFixed(2)} บาท`
  );
}

if (Number(loan.lost_fee || 0) > 0) {
  fineItems.push(
    `ค่าปรับหนังสือสูญหาย: ${Number(loan.lost_fee).toFixed(2)} บาท`
  );
}

const fineText = fineItems.length > 0
  ? `💰 รายการค่าปรับ

${fineItems.map((item, index) =>
  `${index + 1}. ${item}`
).join('\n')}

รวมค่าปรับ: ${Number(loan.total_fine || 0).toFixed(2)} บาท

หมายเหตุ: กรุณาชำระค่าปรับกับเจ้าหน้าที่ห้องสมุด`
  : 'ไม่มีค่าปรับ';

const text =
`✅ คืนหนังสือเรียบร้อย

หนังสือ: ${loan.title}
รหัสเล่ม: ${loan.copy_code || '-'}
วันที่คืน: ${thaiDate(loan.returned_at)}

${fineText}`;
  await pushLine(
    loan.line_user_id,
    text
  );

  await addLoanLog(
    loan.user_id,
    loan.id,
    'RETURN_COMPLETED'
  );

  return true;
}


/* =========================================================
   FINE PAID
========================================================= */

export async function notifyFinePaid(
  loanId
) {
  const { rows } = await pool.query(
    `
      SELECT
        l.id,
        l.user_id,
        l.total_fine,
        l.payment_method,
        l.fine_paid_at,

        b.title,

        lal.line_user_id

      FROM loans l

      JOIN books b
        ON b.id = l.book_id

      JOIN line_account_links lal
        ON lal.user_id = l.user_id

      WHERE l.id = $1

        AND l.payment_status = 'PAID'

      LIMIT 1
    `,
    [loanId]
  );

  const loan = rows[0];

  if (!loan) {
    return false;
  }

  if (
    await hasLoanLog(
      loan.id,
      'FINE_PAID'
    )
  ) {
    return false;
  }

  const paymentMethod =
    loan.payment_method === 'CASH'
      ? 'เงินสด'
      : loan.payment_method === 'QR'
        ? 'QR / โอนเงิน'
        : loan.payment_method || '-';

  const text =
`💰 ชำระค่าปรับสำเร็จ

หนังสือ: ${loan.title}
ยอดชำระ: ${Number(
  loan.total_fine || 0
).toFixed(2)} บาท
ช่องทาง: ${paymentMethod}
วันที่ชำระ: ${thaiDate(loan.fine_paid_at)}

สถานะ: ชำระแล้ว`;

  await pushLine(
    loan.line_user_id,
    text
  );

  await addLoanLog(
    loan.user_id,
    loan.id,
    'FINE_PAID'
  );

  return true;
}
/* =========================================================
   FINE PAYMENT REJECTED
   แจ้ง LINE เมื่อเจ้าหน้าที่ไม่อนุมัติสลิป
========================================================= */

export async function notifyFinePaymentRejected(loanId) {
  const { rows } = await pool.query(
    `
      SELECT
        l.id,
        l.user_id,
        l.payment_note,

        l.late_fee,
        l.damage_fee,
        l.lost_fee,
        l.total_fine,

        b.title,

        bc.copy_code,

        lal.line_user_id

      FROM loans l

      JOIN books b
        ON b.id = l.book_id

      LEFT JOIN book_copies bc
        ON bc.id = l.copy_id

      JOIN line_account_links lal
        ON lal.user_id = l.user_id

      WHERE l.id = $1

        AND l.payment_method = 'QR'

        AND l.payment_status = 'UNPAID'

      LIMIT 1
    `,
    [loanId]
  );

  const loan = rows[0];

  if (!loan) {
    return false;
  }

  // เหตุผลที่เจ้าหน้าที่กรอก
  const reason =
    loan.payment_note?.trim() ||
    'สลิปไม่ถูกต้อง';

  // แสดงเฉพาะค่าปรับที่มีจริง
  const fineItems = [];

  if (Number(loan.late_fee || 0) > 0) {
    fineItems.push(
      `ค่าปรับคืนล่าช้า: ${Number(
        loan.late_fee
      ).toFixed(2)} บาท`
    );
  }

  if (Number(loan.damage_fee || 0) > 0) {
    fineItems.push(
      `ค่าปรับหนังสือชำรุด: ${Number(
        loan.damage_fee
      ).toFixed(2)} บาท`
    );
  }

  if (Number(loan.lost_fee || 0) > 0) {
    fineItems.push(
      `ค่าปรับหนังสือสูญหาย: ${Number(
        loan.lost_fee
      ).toFixed(2)} บาท`
    );
  }

  const fineText =
    fineItems.length > 0
      ? fineItems
          .map(
            (item, index) =>
              `${index + 1}. ${item}`
          )
          .join('\n')
      : 'ไม่มีรายการค่าปรับ';

  const text =
`❌ ไม่อนุมัติการชำระค่าปรับ

หนังสือ: ${loan.title}
รหัสเล่ม: ${loan.copy_code || '-'}

💰 รายการค่าปรับ
${fineText}

ยอดค่าปรับรวม: ${Number(
  loan.total_fine || 0
).toFixed(2)} บาท

สถานะ: ไม่อนุมัติการชำระเงิน

📋 เหตุผลที่ไม่อนุมัติ:
${reason}

กรุณาตรวจสอบและส่งสลิปการชำระเงินใหม่ผ่านเว็บไซต์ห้องสมุด`;

  await pushLine(
    loan.line_user_id,
    text
  );

  return true;
}

/* =========================================================
   RESERVATION EXPIRING
   แจ้งก่อนหมดอายุ 1 วัน
========================================================= */

export async function checkExpiringReservations() {
  const { rows } = await pool.query(
    `
      SELECT
        r.id,
        r.user_id,
        r.expires_at,

        b.title,

        lal.line_user_id

      FROM reservations r

      JOIN books b
        ON b.id = r.book_id

      JOIN line_account_links lal
        ON lal.user_id = r.user_id

      WHERE r.status = 'PENDING'

        AND (
          r.expires_at
          AT TIME ZONE 'Asia/Bangkok'
        )::date
        =
        (
          (
            NOW()
            AT TIME ZONE 'Asia/Bangkok'
          )::date
          + 1
        )
    `
  );

  let sent = 0;

  for (const reservation of rows) {
    if (
      await hasReservationLog(
        reservation.id,
        'RESERVATION_EXPIRING'
      )
    ) {
      continue;
    }

    const text =
`⏰ การจองใกล้หมดอายุ

หนังสือ: ${reservation.title}
หมดอายุวันที่: ${thaiDate(
  reservation.expires_at
)}

กรุณามารับหนังสือภายในเวลาที่กำหนด`;

    try {
      await pushLine(
        reservation.line_user_id,
        text
      );

      await addReservationLog(
        reservation.user_id,
        reservation.id,
        'RESERVATION_EXPIRING'
      );

      sent++;
    } catch (error) {
      console.error(
        `LINE RESERVATION_EXPIRING failed: reservation ${reservation.id}`,
        error
      );
    }
  }

  return {
    found: rows.length,
    sent,
  };
}


/* =========================================================
   DUE SOON
   แจ้งก่อนกำหนดคืน 1 วัน
========================================================= */

export async function checkDueSoonLoans() {
  const { rows } = await pool.query(
    `
      SELECT
        l.id,
        l.user_id,

        COALESCE(
          l.renewed_until,
          l.due_at
        ) AS effective_due_at,

        b.title,

        bc.copy_code,

        lal.line_user_id

      FROM loans l

      JOIN books b
        ON b.id = l.book_id

      LEFT JOIN book_copies bc
        ON bc.id = l.copy_id

      JOIN line_account_links lal
        ON lal.user_id = l.user_id

      WHERE l.returned_at IS NULL

        AND (
          COALESCE(
            l.renewed_until,
            l.due_at
          )
          AT TIME ZONE 'Asia/Bangkok'
        )::date
        =
        (
          (
            NOW()
            AT TIME ZONE 'Asia/Bangkok'
          )::date
          + 1
        )
    `
  );

  let sent = 0;

  for (const loan of rows) {
    if (
      await hasLoanLog(
        loan.id,
        'DUE_SOON'
      )
    ) {
      continue;
    }

    const text =
`⏰ ใกล้ถึงกำหนดคืนหนังสือ

หนังสือ: ${loan.title}
รหัสเล่ม: ${loan.copy_code || '-'}
กำหนดคืน: ${thaiDate(
  loan.effective_due_at
)}

กรุณาคืนหนังสือตามกำหนดเพื่อหลีกเลี่ยงค่าปรับ`;

    try {
      await pushLine(
        loan.line_user_id,
        text
      );

      await addLoanLog(
        loan.user_id,
        loan.id,
        'DUE_SOON'
      );

      sent++;
    } catch (error) {
      console.error(
        `LINE DUE_SOON failed: loan ${loan.id}`,
        error
      );
    }
  }

  return {
    found: rows.length,
    sent,
  };
}


/* =========================================================
   OVERDUE
   แจ้งทุกวันเมื่อเกินกำหนด
========================================================= */

export async function checkOverdueLoans() {
  const { rows } = await pool.query(
    `
      SELECT
        l.id,
        l.user_id,

        COALESCE(
          l.renewed_until,
          l.due_at
        ) AS effective_due_at,

        (
          (
            NOW()
            AT TIME ZONE 'Asia/Bangkok'
          )::date

          -

          (
            COALESCE(
              l.renewed_until,
              l.due_at
            )
            AT TIME ZONE 'Asia/Bangkok'
          )::date
        )::int AS overdue_days,

        b.title,

        bc.copy_code,

        lal.line_user_id

      FROM loans l

      JOIN books b
        ON b.id = l.book_id

      LEFT JOIN book_copies bc
        ON bc.id = l.copy_id

      JOIN line_account_links lal
        ON lal.user_id = l.user_id

      WHERE l.returned_at IS NULL

        AND (
          COALESCE(
            l.renewed_until,
            l.due_at
          )
          AT TIME ZONE 'Asia/Bangkok'
        )::date

        <

        (
          NOW()
          AT TIME ZONE 'Asia/Bangkok'
        )::date
    `
  );

  let sent = 0;

  for (const loan of rows) {
    if (
      await hasLoanLog(
        loan.id,
        'OVERDUE'
      )
    ) {
      continue;
    }

    const overdueDays =
      Number(loan.overdue_days || 0);

    const estimatedFine =
      overdueDays * 1;

    const text =
`⚠️ หนังสือเกินกำหนดคืน

หนังสือ: ${loan.title}
รหัสเล่ม: ${loan.copy_code || '-'}
กำหนดคืน: ${thaiDate(
  loan.effective_due_at
)}

เกินกำหนด: ${overdueDays} วัน
ค่าปรับโดยประมาณ: ${estimatedFine.toFixed(
  2
)} บาท

ค่าปรับล่าช้า 1 บาท / วัน
กรุณานำหนังสือมาคืนโดยเร็ว`;

    try {
      await pushLine(
        loan.line_user_id,
        text
      );

      await addLoanLog(
        loan.user_id,
        loan.id,
        'OVERDUE'
      );

      sent++;
    } catch (error) {
      console.error(
        `LINE OVERDUE failed: loan ${loan.id}`,
        error
      );
    }
  }

  return {
    found: rows.length,
    sent,
  };
}


/* =========================================================
   RUN ALL SCHEDULED NOTIFICATIONS
========================================================= */

export async function runLineNotifications() {
  console.log(
    '=== RUN LINE NOTIFICATIONS ==='
  );

  const reservationExpiring =
    await checkExpiringReservations();

  const dueSoon =
    await checkDueSoonLoans();

  const overdue =
    await checkOverdueLoans();

  const result = {
    reservationExpiring,
    dueSoon,
    overdue,
  };

  console.log(
    'LINE notifications complete:',
    result
  );

  return result;
}
/* =========================================================
   QR PAYMENT SUBMITTED
   แจ้งเจ้าหน้าที่เมื่อสมาชิกส่งสลิป QR
========================================================= */

export async function notifyQrPaymentSubmitted(loanId) {
  const { rows } = await pool.query(
    `
      SELECT
        l.id,
        l.total_fine,
        l.payment_submitted_at,
        b.title,
        u.name AS member_name,
        u.school_code
      FROM loans l
      JOIN books b
        ON b.id = l.book_id
      JOIN users u
        ON u.id = l.user_id
      WHERE l.id = $1
        AND l.payment_method = 'QR'
        AND l.payment_status = 'PENDING'
      LIMIT 1
    `,
    [loanId]
  );

  const payment = rows[0];

  if (!payment) {
    return {
      found: 0,
      sent: 0,
    };
  }

  const admins = await pool.query(
    `
      SELECT DISTINCT
        u.id,
        lal.line_user_id
      FROM users u
      JOIN line_account_links lal
        ON lal.user_id = u.id
      WHERE u.role = 'ADMIN'
        AND u.active = true
        AND lal.line_user_id IS NOT NULL
    `
  );

  const text =
`📩 มีรายการชำระค่าปรับรอตรวจสอบ

สมาชิก: ${payment.member_name}
รหัสสมาชิก: ${payment.school_code || '-'}
หนังสือ: ${payment.title}
รายการยืมเลขที่: ${payment.id}

💰 ยอดชำระ: ${Number(
  payment.total_fine || 0
).toFixed(2)} บาท

ช่องทาง: QR / โอนเงิน
วันที่ส่งสลิป: ${thaiDate(
  payment.payment_submitted_at
)}

สถานะ: รอตรวจสอบสลิป

กรุณาเข้าสู่ระบบห้องสมุดเพื่อตรวจสอบและอนุมัติรายการ`;

  let sent = 0;

  for (const admin of admins.rows) {
    try {
      await pushLine(
        admin.line_user_id,
        text
      );

      sent++;
    } catch (error) {
      console.error(
        `LINE QR notification failed for admin ${admin.id}:`,
        error
      );
    }
  }

  return {
    found: admins.rows.length,
    sent,
  };
}