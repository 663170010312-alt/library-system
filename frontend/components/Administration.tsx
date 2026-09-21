'use client';

import { useEffect, useState } from 'react';
import {
  api,
  Category,
  User,
} from '@/lib/api';

type Reports = {
  monthly: {
    month: string;
    loans: number;
    returned: number;
  }[];

  popular: {
    title: string;
    loans: number;
  }[];
};

type UserType =
  | 'STUDENT'
  | 'TEACHER';

export default function Administration({
  mode,
  user,
  notify,
}: {
  mode: string;
  user: User;
  notify: (
    s: string,
    error?: boolean
  ) => void;
}) {
  const [users, setUsers] =
    useState<User[]>([]);

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [reports, setReports] =
    useState<Reports | null>(null);

  const [editing, setEditing] =
    useState<User | null>(null);

  const [revision, setRevision] =
    useState(0);

  const [error, setError] =
    useState('');

  const [busy, setBusy] =
    useState(false);

  // ใช้ควบคุมช่องของนักเรียน / ครู
  const [formUserType, setFormUserType] =
    useState<UserType>('STUDENT');

  useEffect(() => {
    setError('');

    if (mode === 'categories') {
      api<Category[]>('/categories')
        .then(setCategories)
        .catch((e) =>
          setError(e.message)
        );
    } else if (mode === 'reports') {
      api<Reports>('/loans/reports')
        .then(setReports)
        .catch((e) =>
          setError(e.message)
        );
    } else {
      api<User[]>('/users')
        .then(setUsers)
        .catch((e) =>
          setError(e.message)
        );
    }
  }, [mode, revision]);

  useEffect(() => {
    if (
      editing?.user_type ===
      'TEACHER'
    ) {
      setFormUserType('TEACHER');
    } else {
      setFormUserType('STUDENT');
    }
  }, [editing]);

  async function save(
    path: string,
    method: string,
    body?: unknown
  ) {
    setBusy(true);

    try {
      await api(
        path,
        method,
        body
      );

      setRevision(
        (v) => v + 1
      );

      notify(
        'บันทึกข้อมูลแล้ว'
      );

      return true;
    } catch (e) {
      notify(
        (e as Error).message,
        true
      );

      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <p
        className="panel text-red-700"
        role="alert"
      >
        {error}
      </p>
    );
  }


  /* =========================================================
     REPORTS
  ========================================================= */

  if (mode === 'reports') {
    return (
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="panel overflow-x-auto">
          <h2 className="mb-5">
            การยืมรายเดือน
          </h2>

          <p className="muted mb-3">
            12 เดือนล่าสุดที่มีการยืม •
            คืนแล้วนับจากรายการที่ยืมในเดือนนั้น
          </p>

          <table>
            <thead>
              <tr>
                <th>เดือน</th>
                <th>ยืม</th>
                <th>คืนแล้ว</th>
              </tr>
            </thead>

            <tbody>
              {reports?.monthly.map(
                (r) => (
                  <tr key={r.month}>
                    <td>
                      {r.month}
                    </td>

                    <td>
                      {r.loans}
                    </td>

                    <td>
                      {r.returned}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>

          {!reports?.monthly.length && (
            <p className="mt-4">
              ยังไม่มีข้อมูล
            </p>
          )}
        </div>

        <div className="panel">
          <h2 className="mb-5">
            หนังสือยอดนิยม 10 อันดับ
          </h2>

          {reports?.popular.map(
            (r, i) => (
              <div
                key={
                  r.title + i
                }
                className="flex justify-between border-b border-gray-100 py-4 gap-5"
              >
                <span>
                  {i + 1}.{' '}
                  {r.title}
                </span>

                <span>
                  {r.loans} ครั้ง
                </span>
              </div>
            )
          )}

          {!reports?.popular.length && (
            <p>
              ยังไม่มีข้อมูล
            </p>
          )}
        </div>
      </div>
    );
  }


  /* =========================================================
     CATEGORIES
  ========================================================= */

  if (mode === 'categories') {
    return (
      <div className="panel max-w-2xl space-y-5">
        <form
          className="flex gap-3 items-end"
          onSubmit={async (e) => {
            e.preventDefault();

            const form =
              e.currentTarget;

            if (
              await save(
                '/categories',
                'POST',
                Object.fromEntries(
                  new FormData(form)
                )
              )
            ) {
              form.reset();
            }
          }}
        >
          <label className="flex-1">
            ชื่อหมวดหมู่ใหม่

            <input
              name="name"
              required
              maxLength={100}
            />
          </label>

          <button
            className="btn"
            disabled={busy}
          >
            เพิ่ม
          </button>
        </form>

        {categories.map((c) => (
          <form
            key={`${c.id}-${c.name}`}
            className="flex items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();

              await save(
                `/categories/${c.id}`,
                'PUT',
                Object.fromEntries(
                  new FormData(
                    e.currentTarget
                  )
                )
              );
            }}
          >
            <label className="flex-1">
              หมวดหมู่ #{c.id}

              <input
                name="name"
                defaultValue={
                  c.name
                }
                maxLength={100}
                required
              />
            </label>

            <button
              className="btn secondary"
              disabled={busy}
            >
              บันทึก
            </button>

            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    `ลบหมวดหมู่ “${c.name}”?`
                  )
                ) {
                  save(
                    `/categories/${c.id}`,
                    'DELETE'
                  );
                }
              }}
            >
              ลบ
            </button>
          </form>
        ))}
      </div>
    );
  }


  /* =========================================================
     USERS
  ========================================================= */

  const shown =
    users.filter((u) =>
      mode === 'staff'
        ? u.role === 'ADMIN'
        : u.role === 'MEMBER'
    );

  const creatingMember =
    mode === 'members';

  return (
    <div className="space-y-5">
      {/* =====================================================
          CREATE / EDIT USER
      ===================================================== */}

      <form
        key={`${mode}-${editing?.id || 'new'}`}
        className="panel grid sm:grid-cols-2 gap-4"
        onSubmit={async (e) => {
          e.preventDefault();

          const form =
            e.currentTarget;

          const raw =
            Object.fromEntries(
              new FormData(form)
            );

          const body = {
            ...raw,

            role:
              creatingMember
                ? 'MEMBER'
                : 'ADMIN',

            // ถ้าเป็นนักเรียน ล้างข้อมูลฝั่งครู
            staff_position:
              creatingMember &&
              formUserType ===
                'TEACHER'
                ? raw.staff_position
                : '',

            department:
              creatingMember &&
              formUserType ===
                'TEACHER'
                ? raw.department
                : '',

            // ถ้าเป็นครู ล้างข้อมูลชั้น/ห้อง
            class_level:
              creatingMember &&
              formUserType ===
                'STUDENT'
                ? raw.class_level
                : '',

            room:
              creatingMember &&
              formUserType ===
                'STUDENT'
                ? raw.room
                : '',
          };

          const ok =
            await save(
              editing
                ? `/users/${editing.id}`
                : '/users',

              editing
                ? 'PUT'
                : 'POST',

              body
            );

          if (ok) {
            form.reset();

            setEditing(null);

            setFormUserType(
              'STUDENT'
            );
          }
        }}
      >
        <h2 className="sm:col-span-2">
          {editing
            ? 'แก้ไข'
            : 'เพิ่ม'}

          {creatingMember
            ? 'ผู้ใช้ห้องสมุด'
            : 'บัญชีเจ้าหน้าที่'}
        </h2>


        {/* ชื่อ */}
        <label>
          ชื่อ–นามสกุล

          <input
            name="name"
            maxLength={100}
            required
            defaultValue={
              editing?.name || ''
            }
          />
        </label>


        {/* Email */}
        <label>
          อีเมล

          <input
            name="email"
            type="email"
            required
            defaultValue={
              editing?.email || ''
            }
          />
        </label>


        {/* =================================================
            MEMBER ONLY
        ================================================= */}

      {creatingMember && (
  <>
    <label>
      ประเภทผู้ใช้
      <select
        name="user_type"
        required
        value={formUserType}
        onChange={(e) =>
          setFormUserType(
            e.target.value as 'STUDENT' | 'TEACHER'
          )
        }
      >
        <option value="STUDENT">
          นักเรียน
        </option>

        <option value="TEACHER">
          ครู / บุคลากร
        </option>
      </select>
    </label>

    <label>
      {formUserType === 'STUDENT'
        ? 'รหัสนักเรียน'
        : 'รหัสบุคลากร'}

      <input
        name="school_code"
        maxLength={50}
        required
        defaultValue={
          editing?.school_code ||
          editing?.student_code ||
          ''
        }
        placeholder={
          formUserType === 'STUDENT'
            ? 'เช่น 66012345'
            : 'เช่น T001'
        }
      />
    </label>

    {formUserType === 'STUDENT' && (
      <>
        <label>
          ชั้น
          <input
            name="class_level"
            maxLength={50}
            required
            defaultValue={
              editing?.class_level || ''
            }
            placeholder="เช่น ม.6"
          />
        </label>

        <label>
          ห้อง
          <input
            name="room"
            maxLength={20}
            required
            defaultValue={
              editing?.room || ''
            }
            placeholder="เช่น 1"
          />
        </label>
      </>
    )}

    {formUserType === 'TEACHER' && (
      <>
        <label>
          ตำแหน่ง
          <input
            name="staff_position"
            maxLength={100}
            required
            defaultValue={
              editing?.staff_position || ''
            }
            placeholder="เช่น ครูผู้สอน"
          />
        </label>

        <label>
          กลุ่มสาระ / ฝ่ายงาน
          <input
            name="department"
            maxLength={100}
            required
            defaultValue={
              editing?.department || ''
            }
            placeholder="เช่น วิทยาศาสตร์และเทคโนโลยี"
          />
        </label>
      </>
    )}
  </>
)}




        {/* PASSWORD */}
        <label>
          {editing
            ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)'
            : 'รหัสผ่านเริ่มต้น'}

          <input
            name="password"
            type="password"
            minLength={8}
            required={!editing}
            autoComplete="new-password"
          />
        </label>


        <input
          type="hidden"
          name="role"
          value={
            creatingMember
              ? 'MEMBER'
              : 'ADMIN'
          }
        />


        {/* BUTTONS */}
        <div className="sm:col-span-2 flex gap-2">
          <button
            className="btn w-fit"
            disabled={busy}
          >
            {editing
              ? 'บันทึกการแก้ไข'
              : 'สร้างบัญชี'}
          </button>

          {editing && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setEditing(null);

                setFormUserType(
                  'STUDENT'
                );
              }}
            >
              ยกเลิก
            </button>
          )}
        </div>
      </form>


      {/* =====================================================
          USER TABLE
      ===================================================== */}

      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>ชื่อ</th>

              {creatingMember && (
                <>
                  <th>ประเภท</th>
                  <th>รหัส</th>
                  <th>ข้อมูลนักเรียน / บุคลากร</th>
                </>
              )}

              <th>อีเมล</th>
              <th>สถานะ</th>
              <th>จัดการ</th>
            </tr>
          </thead>

          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.name}
                </td>

                {creatingMember && (
                  <>
                    {/* ประเภท */}
                    <td>
                      {u.user_type ===
                      'TEACHER'
                        ? 'ครู / บุคลากร'
                        : u.user_type ===
                            'STUDENT'
                          ? 'นักเรียน'
                          : 'ยังไม่ระบุ'}
                    </td>

                    {/* รหัส */}
                    <td>
                      {u.school_code ||
                        u.student_code ||
                        '—'}
                    </td>

                    {/* รายละเอียดตามประเภท */}
                    <td>
                      {u.user_type ===
                      'STUDENT' ? (
                        <>
                          <p>
                            ชั้น:{' '}
                            <strong>
                              {u.class_level ||
                                '—'}
                            </strong>
                          </p>

                          <p className="muted text-xs">
                            ห้อง:{' '}
                            {u.room ||
                              '—'}
                          </p>
                        </>
                      ) : u.user_type ===
                        'TEACHER' ? (
                        <>
                          <p>
                            <strong>
                              {u.staff_position ||
                                '—'}
                            </strong>
                          </p>

                          <p className="muted text-xs">
                            {u.department ||
                              '—'}
                          </p>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </>
                )}

                <td>
                  {u.email}
                </td>

                <td>
                  <span className="badge">
                    {u.active
                      ? 'ใช้งาน'
                      : 'ปิดบัญชี'}
                  </span>
                </td>

                <td>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditing(u);

                        setFormUserType(
                          u.user_type ===
                            'TEACHER'
                            ? 'TEACHER'
                            : 'STUDENT'
                        );
                      }}
                    >
                      แก้ไข
                    </button>

                    {u.id !== user.id && (
                      <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              `${
                                u.active
                                  ? 'ปิด'
                                  : 'เปิด'
                              }บัญชี ${u.name}?`
                            )
                          ) {
                            save(
                              `/users/${u.id}`,
                              'PATCH',
                              {
                                role:
                                  u.role,

                                active:
                                  !u.active,
                              }
                            );
                          }
                        }}
                      >
                        {u.active
                          ? 'ปิดบัญชี'
                          : 'เปิดบัญชี'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!shown.length && (
          <p className="mt-4">
            ยังไม่มีบัญชี
          </p>
        )}
      </div>
    </div>
  );
}
