# CBPI BOOKTRACK – Server (Library Management System)

Backend server for **CBPI BOOKTRACK**, a MERN-based Library Management System with role-based access for **Admin**, **Teacher**, and **Member (Student)**.

---

## 🚀 Tech Stack

- **Node.js**
- **Express.js**
- **MongoDB (Native Driver)**
- **Firebase Admin SDK** (Authentication & Token Verification)
- **dotenv**
- **CORS**

---

##✅ Features Summary

Firebase JWT authentication

Role-based dashboards

Borrow & return approval workflow

Admin analytics dashboard

Pagination & filtering everywhere

Secure MongoDB aggregation

Clean REST API design

## 🔐 Authentication & Authorization

- Firebase Authentication (Client Side)
- Firebase Admin SDK (Server Side)
- Bearer Token (`Authorization: Bearer <token>`)
- Role-based access control:
  - `admin`
  - `teacher`
  - `member`

---

## 🌐 Live Allowed Origins

```txt
http://localhost:5173
https://cbpi-booktrack.web.app

```
```
Collections

 UserCollection

 BookCollection

 BorrowCollection

 ContactMassage

 CarouselCollection


 ```
```
 .env

PORT=3000
DB_URI=your_mongodb_connection_string
FIREBASEJDK=base64_encoded_firebase_admin_sdk_json

```


## 👤 User Routes

| Method | Endpoint | Description |
|------|---------|------------|
| POST | /register | Register user (if not exists) |
| GET | /me | Get logged-in user profile |
| PUT | /update | Update own profile |
| GET | /users | Get users (admin only, pagination & filter) |
| DELETE | /users/:id | Delete user (admin only) |
| PATCH | /users/:id/status | Toggle user status |

---

## 📚 Book Routes

| Method | Endpoint | Description |
|------|---------|------------|
| GET | /books | Get books (search, filter, pagination) |
| GET | /books/:id | Get single book |
| POST | /books | Add new book |
| PUT | /books/:id | Update book |
| DELETE | /books/:id | Delete book |
| GET | /books/categories | Get available categories |

---

## 🔄 Borrow & Return System

### Borrow Rules

| Role | Max Books | Days |
|-----|----------|------|
| Member | 3 | 7 |
| Teacher | 14 | 15 |
| Admin | Unlimited | 30 |

### Borrow Status Flow

```txt
pending-borrow → borrowed → pending-return → returned
