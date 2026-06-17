# คู่มือ Deploy SEC Form Generator

## โครงสร้างโปรเจกต์

```
sec-project/
├── backend/
│   ├── main.py                      ← FastAPI app
│   ├── requirements.txt             ← Python dependencies
│   ├── render.yaml                  ← Render config
│   └── FM-QAF-01-02_02_form.xlsx   ← ไฟล์ template (ต้องอยู่ที่นี่)
│
└── frontend/
    ├── src/
    │   ├── App.jsx                  ← Main component
    │   ├── App.css                  ← Styles
    │   ├── main.jsx                 ← Entry point
    │   ├── index.css                ← Global styles
    │   └── api.js                   ← API helper
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── .env.example                 ← Copy เป็น .env.local
```

---

## ขั้นตอนที่ 1 — อัปโหลดขึ้น GitHub

1. สร้าง repository ใหม่บน GitHub (เช่น `sec-form-generator`)
2. อัปโหลดทั้ง 2 โฟลเดอร์ `backend/` และ `frontend/` ขึ้นไป
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/YOUR-USERNAME/sec-form-generator.git
   git push -u origin main
   ```

---

## ขั้นตอนที่ 2 — Deploy Backend บน Render.com

1. ไปที่ **https://render.com** → Sign Up / Log In
2. คลิก **New** → **Web Service**
3. เชื่อม GitHub repo ที่สร้างไว้
4. ตั้งค่าดังนี้:

   | Field            | ค่า                                      |
   |------------------|------------------------------------------|
   | **Name**         | `sec-form-api`                           |
   | **Root Directory** | `backend`                              |
   | **Environment**  | `Python`                                 |
   | **Build Command**| `apt-get update -y && apt-get install -y libreoffice poppler-utils fonts-thai-tlwg && pip install -r requirements.txt` |
   | **Start Command**| `uvicorn main:app --host 0.0.0.0 --port $PORT` |
   | **Plan**         | `Free`                                   |

5. เพิ่ม Environment Variable:
   - Key: `FRONTEND_URL` → Value: (ใส่ก่อน แล้วแก้ทีหลังหลัง deploy Vercel)

6. คลิก **Create Web Service** → รอ build เสร็จ (~5 นาที)
7. จด URL ที่ได้ เช่น `https://sec-form-api.onrender.com`

---

## ขั้นตอนที่ 3 — Deploy Frontend บน Vercel

1. ไปที่ **https://vercel.com** → Sign Up / Log In
2. คลิก **Add New Project** → Import GitHub repo
3. ตั้งค่าดังนี้:

   | Field                | ค่า          |
   |----------------------|--------------|
   | **Framework Preset** | `Vite`       |
   | **Root Directory**   | `frontend`   |

4. ขยาย **Environment Variables** เพิ่ม:
   - Key: `VITE_API_URL` → Value: `https://sec-form-api.onrender.com`
     (URL จาก Render ในขั้นตอนที่ 2)

5. คลิก **Deploy** → รอ ~2 นาที
6. จด URL เช่น `https://sec-form-generator.vercel.app`

---

## ขั้นตอนที่ 4 — แก้ CORS บน Render

1. กลับไปที่ Render Dashboard → Service ของคุณ
2. ไปที่ **Environment** → แก้ค่า `FRONTEND_URL`
   → ใส่ URL จาก Vercel เช่น `https://sec-form-generator.vercel.app`
3. คลิก **Save Changes** → Render จะ redeploy อัตโนมัติ

---

## ⚠️ หมายเหตุสำคัญ — Render Free Tier Sleep

Render Free Tier จะ **หลับ** หลังจากไม่มี request 15 นาที  
ตื่นครั้งแรกจะใช้เวลา **30–60 วินาที**  
แอปพลิเคชันนี้มี loading state แจ้งผู้ใช้ระหว่างรอแล้ว ✓

---

## ทดสอบ Local

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (terminal ใหม่)
cd frontend
cp .env.example .env.local
# แก้ VITE_API_URL=http://localhost:8000 ใน .env.local
npm install
npm run dev
```

เปิด http://localhost:5173 ✓
