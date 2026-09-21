'use client';

import { useState } from 'react';
import { api, User } from '@/lib/api';
import { useApp } from '@/components/AppShell';

type UserType = 'STUDENT' | 'TEACHER';

export default function ProfilePage() {
  const {
    user,
    setUser: updateUser,
    notify,
  } = useApp();

  const [editing, setEditing] =
    useState(false);

  const [busy, setBusy] =
    useState(false);

  const [userType, setUserType] =
    useState<UserType>(
      user?.user_type === 'TEACHER'
        ? 'TEACHER'
        : 'STUDENT'
    );

  if (!user) return null;

  // เก็บค่า user หลังผ่านการตรวจ null แล้ว เพื่อให้ TypeScript รู้ว่าไม่เป็น null ในฟังก์ชันด้านล่าง
  const currentUser = user;

  const isAdmin =
    currentUser.role === 'ADMIN';

  const isStudent =
    currentUser.role === 'MEMBER' &&
    currentUser.user_type === 'STUDENT';

  const isTeacher =
    currentUser.role === 'MEMBER' &&
    currentUser.user_type === 'TEACHER';

  function startEditing() {
    setUserType(
      currentUser.user_type === 'TEACHER'
        ? 'TEACHER'
        : 'STUDENT'
    );

    setEditing(true);
  }

  function cancelEditing() {
    setUserType(
      currentUser.user_type === 'TEACHER'
        ? 'TEACHER'
        : 'STUDENT'
    );

    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="panel max-w-2xl space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2>ข้อมูลโปรไฟล์</h2>

            <p className="muted mt-1">
              ข้อมูลบัญชีผู้ใช้งานระบบห้องสมุด
            </p>
          </div>

          <button
            type="button"
            className="btn"
            onClick={startEditing}
          >
            แก้ไขข้อมูล
          </button>
        </div>

        <hr className="border-gray-200" />

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <p className="muted text-sm">
              ชื่อ–นามสกุล
            </p>

            <p className="font-medium mt-1">
              {currentUser.name}
            </p>
          </div>

          <div>
            <p className="muted text-sm">
              อีเมล
            </p>

            <p className="font-medium mt-1">
              {currentUser.email}
            </p>
          </div>

          <div>
            <p className="muted text-sm">
              สิทธิ์ระบบ
            </p>

            <p className="font-medium mt-1">
              {currentUser.role === 'ADMIN'
                ? 'ผู้ดูแลระบบ'
                : 'ผู้ใช้ห้องสมุด'}
            </p>
          </div>

          <div>
            <p className="muted text-sm">
              สถานะบัญชี
            </p>

            <p className="font-medium mt-1">
              {currentUser.active
                ? 'ใช้งาน'
                : 'ปิดบัญชี'}
            </p>
          </div>
        </div>

        {/* =========================
            STUDENT
        ========================== */}

        {isStudent && (
          <>
            <hr className="border-gray-200" />

            <div>
              <h3 className="font-semibold mb-4">
                ข้อมูลนักเรียน
              </h3>

              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <p className="muted text-sm">
                    รหัสนักเรียน
                  </p>

                  <p className="font-medium mt-1">
                    {currentUser.school_code ||
                      currentUser.student_code ||
                      '—'}
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    ประเภทผู้ใช้
                  </p>

                  <p className="font-medium mt-1">
                    นักเรียน
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    ชั้น
                  </p>

                  <p className="font-medium mt-1">
                    {currentUser.class_level ||
                      '—'}
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    ห้อง
                  </p>

                  <p className="font-medium mt-1">
                    {currentUser.room ||
                      '—'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* =========================
            TEACHER
        ========================== */}

        {isTeacher && (
          <>
            <hr className="border-gray-200" />

            <div>
              <h3 className="font-semibold mb-4">
                ข้อมูลครู / บุคลากร
              </h3>

              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <p className="muted text-sm">
                    รหัสบุคลากร
                  </p>

                  <p className="font-medium mt-1">
                    {currentUser.school_code ||
                      currentUser.student_code ||
                      '—'}
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    ประเภทผู้ใช้
                  </p>

                  <p className="font-medium mt-1">
                    ครู / บุคลากร
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    ตำแหน่ง
                  </p>

                  <p className="font-medium mt-1">
                    {currentUser.staff_position ||
                      '—'}
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    กลุ่มสาระ / ฝ่ายงาน
                  </p>

                  <p className="font-medium mt-1">
                    {currentUser.department ||
                      '—'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* =========================
            ADMIN
        ========================== */}

        {isAdmin && (
          <>
            <hr className="border-gray-200" />

            <div>
              <h3 className="font-semibold mb-2">
                ข้อมูลผู้ดูแลระบบ
              </h3>

              <p className="muted">
                บัญชีนี้มีสิทธิ์จัดการระบบห้องสมุด
              </p>
            </div>
          </>
        )}
      </div>
    );
  }

  /* =========================================================
     EDIT MODE
  ========================================================= */

  return (
    <form
      className="panel max-w-2xl space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();

        const form =
          e.currentTarget;

        setBusy(true);

        try {
          const raw =
            Object.fromEntries(
              new FormData(form)
            );

          const body: Record<
            string,
            FormDataEntryValue | string
          > = {
            ...raw,
          };

          if (!isAdmin) {
            body.user_type =
              userType;

            body.school_code =
              raw.school_code || '';

            if (
              userType ===
              'STUDENT'
            ) {
              body.staff_position =
                '';

              body.department =
                '';
            }

            if (
              userType ===
              'TEACHER'
            ) {
              body.class_level =
                '';

              body.room =
                '';
            }
          }

          const updated =
            await api<User>(
              '/users/me',
              'PUT',
              body
            );

          updateUser(updated);

          notify(
            'บันทึกโปรไฟล์แล้ว'
          );

          setEditing(false);
        } catch (err) {
          notify(
            (err as Error)
              .message,
            true
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2>
            แก้ไขข้อมูลโปรไฟล์
          </h2>

          <p className="muted mt-1">
            แก้ไขข้อมูลส่วนตัวของบัญชี
          </p>
        </div>
      </div>

      <hr className="border-gray-200" />

      <div className="grid sm:grid-cols-2 gap-4">
        <label>
          ชื่อ–นามสกุล

          <input
            name="name"
            maxLength={100}
            required
            defaultValue={
              currentUser.name
            }
          />
        </label>

        <label>
          อีเมล

          <input
            name="email"
            type="email"
            required
            defaultValue={
              currentUser.email
            }
          />
        </label>
      </div>

      {/* =========================
          MEMBER
      ========================== */}

      {!isAdmin && (
        <>
          <hr className="border-gray-200" />

          <h3 className="font-semibold">
            ข้อมูลผู้ใช้ห้องสมุด
          </h3>

          <div className="grid sm:grid-cols-2 gap-4">
            <label>
              ประเภทผู้ใช้

              <select
                name="user_type"
                value={userType}
                onChange={(e) =>
                  setUserType(
                    e.target
                      .value as UserType
                  )
                }
                required
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
              {userType ===
              'STUDENT'
                ? 'รหัสนักเรียน'
                : 'รหัสบุคลากร'}

              <input
                name="school_code"
                maxLength={50}
                required
                defaultValue={
                  currentUser.school_code ||
                  currentUser.student_code ||
                  ''
                }
              />
            </label>

            {userType ===
              'STUDENT' && (
              <>
                <label>
                  ชั้น

                  <input
                    name="class_level"
                    maxLength={50}
                    required
                    defaultValue={
                      currentUser.class_level ||
                      ''
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
                      currentUser.room ||
                      ''
                    }
                    placeholder="เช่น 1"
                  />
                </label>
              </>
            )}

            {userType ===
              'TEACHER' && (
              <>
                <label>
                  ตำแหน่ง

                  <input
                    name="staff_position"
                    maxLength={100}
                    required
                    defaultValue={
                      currentUser.staff_position ||
                      ''
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
                      currentUser.department ||
                      ''
                    }
                    placeholder="เช่น วิทยาศาสตร์และเทคโนโลยี"
                  />
                </label>
              </>
            )}
          </div>
        </>
      )}

      {/* =========================
          PASSWORD
      ========================== */}

      <hr className="border-gray-200" />

      <div>
        <h3 className="font-semibold">
          เปลี่ยนรหัสผ่าน
        </h3>

        <p className="muted text-sm mt-1">
          เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่าน
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <label>
          รหัสผ่านปัจจุบัน

          <input
            name="current_password"
            type="password"
            autoComplete="current-password"
          />
        </label>

        <label>
          รหัสผ่านใหม่

          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete="new-password"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn"
          disabled={busy}
        >
          {busy
            ? 'กำลังบันทึก…'
            : 'บันทึกการแก้ไข'}
        </button>

        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={
            cancelEditing
          }
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}