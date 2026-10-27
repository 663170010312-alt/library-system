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

  const [userSearch, setUserSearch] = useState('');

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [editingCategoryId, setEditingCategoryId] =
    useState<number | null>(null);

  const [editingCategoryName, setEditingCategoryName] =
    useState('');

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
     REPORTS / DASHBOARD
  ========================================================= */

  if (mode === 'reports') {
    const monthly = reports?.monthly ?? [];
    const popular = reports?.popular ?? [];
    const totalLoans = monthly.reduce((sum, item) => sum + item.loans, 0);
    const totalReturned = monthly.reduce((sum, item) => sum + item.returned, 0);
    const returnRate = totalLoans > 0
      ? Math.round((totalReturned / totalLoans) * 100)
      : 0;
    const maxLoans = Math.max(1, ...monthly.map((item) => item.loans));
    const formatNumber = (value: number) => value.toLocaleString('th-TH');

    return (
      <div className="space-y-6">
        <section className="panel space-y-2">
          <h2 className="text-xl font-semibold">ภาพรวมสถิติการยืมหนังสือ</h2>
          <p className="muted text-sm">
            สรุปข้อมูลจากรายงานการยืมของห้องสมุด
          </p>
          <p className="muted text-xs">
            รายการคืนแล้วนับจากรายการที่ยืมในเดือนนั้น
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="panel">
            <p className="muted text-sm">รายการยืมในช่วงที่รายงาน</p>
            <p className="text-3xl font-bold text-library mt-3">
              {reports ? formatNumber(totalLoans) : '—'}
            </p>
            <p className="muted text-xs mt-2">ครั้ง</p>
          </div>
          <div className="panel">
            <p className="muted text-sm">รายการที่คืนแล้ว</p>
            <p className="text-3xl font-bold text-library mt-3">
              {reports ? formatNumber(totalReturned) : '—'}
            </p>
            <p className="muted text-xs mt-2">ครั้ง จากรายการยืมที่รายงาน</p>
          </div>
          <div className="panel">
            <p className="muted text-sm">สัดส่วนรายการที่คืนแล้ว</p>
            <p className="text-3xl font-bold text-library mt-3">
              {reports && totalLoans > 0 ? `${returnRate}%` : '—'}
            </p>
            <p className="muted text-xs mt-2">คำนวณจากรายการยืมที่รายงาน</p>
          </div>
        </section>

        <section className="panel space-y-5">
          <div>
            <h2 className="text-lg font-semibold">กราฟสถิติการยืมรายเดือน</h2>
            <p className="muted text-sm mt-2">เปรียบเทียบจำนวนการยืมแต่ละเดือน</p>
          </div>
          {monthly.length > 0 ? (
            <div className="space-y-5">
              {monthly.map((item) => (
                <div key={item.month} className="space-y-2">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium">{item.month}</span>
                    <span className="muted">{formatNumber(item.loans)} ครั้ง</span>
                  </div>
                  <div className="w-full h-5 rounded-full bg-[#edf1e9] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#47765b]"
                      style={{ width: `${Math.max(0, Math.min(100, item.loans / maxLoans * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{reports ? 'ยังไม่มีข้อมูลการยืมรายเดือน' : 'กำลังโหลดข้อมูลรายงาน...'}</p>
          )}
        </section>

        <div className="grid lg:grid-cols-2 gap-5">
          <section className="panel overflow-x-auto">
            <h2 className="text-lg font-semibold mb-3">รายละเอียดการยืมรายเดือน</h2>
            <p className="muted text-sm mb-4">
              12 เดือนล่าสุดที่มีการยืม • คืนแล้วนับจากรายการที่ยืมในเดือนนั้น
            </p>
            {monthly.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr><th>เดือน</th><th>ยืม</th><th>คืนแล้ว</th></tr>
                </thead>
                <tbody>
                  {monthly.map((item) => (
                    <tr key={item.month}>
                      <td>{item.month}</td>
                      <td>{formatNumber(item.loans)}</td>
                      <td>{formatNumber(item.returned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">ยังไม่มีข้อมูล</p>}
          </section>

          <section className="panel">
            <h2 className="text-lg font-semibold mb-3">หนังสือยอดนิยม 10 อันดับ</h2>
            <p className="muted text-sm mb-4">จัดอันดับตามจำนวนครั้งที่ยืม</p>
            {popular.length > 0 ? (
              <div>
                {popular.map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className="flex items-center justify-between gap-4 border-b border-gray-100 py-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-[#edf1e9] text-library font-semibold text-sm">
                        {index + 1}
                      </span>
                      <span className="text-sm break-words">{item.title}</span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-library">
                      {formatNumber(item.loans)} ครั้ง
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="muted">ยังไม่มีข้อมูล</p>}
          </section>
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
        <div>
          <h2 className="text-xl font-semibold">จัดการหมวดหมู่หนังสือ</h2>
          <p className="muted text-sm mt-1">
            เพิ่มหรือเปลี่ยนชื่อหมวดหมู่ โดยหนังสือที่อยู่ในหมวดหมู่เดิมยังคงอยู่
          </p>
        </div>

        <form
          className="flex flex-wrap gap-3 items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = String(new FormData(form).get('name') || '').trim();
            if (!name) {
              notify('กรุณากรอกชื่อหมวดหมู่', true);
              return;
            }
            const ok = await save('/categories', 'POST', { name });
            if (ok) form.reset();
          }}
        >
          <label className="flex-1 min-w-48">
            ชื่อหมวดหมู่ใหม่
            <input name="name" required maxLength={100} />
          </label>
          <button type="submit" className="btn" disabled={busy}>
            + เพิ่มหมวดหมู่
          </button>
        </form>

        <div className="space-y-3">
          <h3 className="font-semibold">รายการหมวดหมู่ทั้งหมด ({categories.length})</h3>
          {categories.map((category) => (
            <div key={category.id} className="border rounded-lg p-4">
              {editingCategoryId === category.id ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = editingCategoryName.trim();
                    if (!name) {
                      notify('กรุณากรอกชื่อหมวดหมู่', true);
                      return;
                    }
                    const ok = await save(
                      `/categories/${category.id}`,
                      'PUT',
                      { name }
                    );
                    if (ok) {
                      setEditingCategoryId(null);
                      setEditingCategoryName('');
                    }
                  }}
                >
                  <label className="flex-1 min-w-48">
                    แก้ไขชื่อหมวดหมู่ #{category.id}
                    <input
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      maxLength={100}
                      required
                      autoFocus
                    />
                  </label>
                  <button type="submit" className="btn" disabled={busy}>
                    บันทึก
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => {
                      setEditingCategoryId(null);
                      setEditingCategoryName('');
                    }}
                  >
                    ยกเลิก
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{category.name}</p>
                    <p className="muted text-xs">หมวดหมู่ #{category.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditingCategoryId(category.id);
                        setEditingCategoryName(category.name);
                      }}
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`ลบหมวดหมู่ “${category.name}”?`)) {
                          save(`/categories/${category.id}`, 'DELETE');
                        }
                      }}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {categories.length === 0 && (
            <p className="muted text-center py-5">ยังไม่มีหมวดหมู่หนังสือ</p>
          )}
        </div>
      </div>
    );
  }


  /* =========================================================
     USERS
  ========================================================= */
const shown = users.filter((u) => {
  const correctRole =
    mode === 'staff'
      ? u.role === 'ADMIN'
      : u.role === 'MEMBER';

  const query = userSearch.trim().toLowerCase();

  const matchesSearch =
    !query ||
    [
      u.name,
      u.email,
      u.school_code,
      u.student_code,
      u.class_level,
      u.room,
      u.staff_position,
      u.department,
    ].some((value) =>
      String(value ?? '')
        .toLowerCase()
        .includes(query)
    );

  return correctRole && matchesSearch;
});

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

            // คงอีเมล ประเภทผู้ใช้ และรหัสประจำตัวเดิมเมื่อแก้ไขบัญชี
            email: editing ? editing.email : raw.email,
            ...(creatingMember
              ? { school_code: editing
                  ? (editing.school_code || editing.student_code || '')
                  : raw.school_code }
              : {}),
            ...(creatingMember
              ? { user_type: editing ? editing.user_type : formUserType }
              : {}),

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
            readOnly={!!editing}
            className={editing ? 'bg-gray-100 cursor-not-allowed' : undefined}
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
        disabled={!!editing}
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
        readOnly={!!editing}
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
         {/* ช่องค้นหารายชื่อผู้ใช้ */}
  <div className="mb-5 flex flex-wrap items-end gap-3">
    <label className="block flex-1 text-sm">
      ค้นหาผู้ใช้
      <input
        type="search"
        className="mt-1 w-full"
        placeholder="ชื่อ / อีเมล / รหัสนักเรียน / ชั้น / ห้อง"
        value={userSearch}
        onChange={(e) => setUserSearch(e.target.value)}
      />
    </label>

    <button
      type="button"
      className="btn secondary"
      onClick={() => setUserSearch('')}
    >
      ล้างการค้นหา
    </button>
  </div>

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
