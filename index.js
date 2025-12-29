require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;
const firebaseKey=Buffer.from(process.env.FIREBASEJDK,'base64').toString('utf8')

const serviceAccount = JSON.parse(firebaseKey);

// const serviceAccount = require("./firebaseAdminJdk.json");r

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(
  cors({
    origin: ["http://localhost:5173","https://cbpi-booktrack.web.app"],
    credentials: true,
  })
);

app.use(express.json());

const client = new MongoClient(process.env.DB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // email, uid, etc.
    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid Token" });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    const database = client.db("LibraryManagement");
    const UserCollection = database.collection("UserCollection");
    const BookCollection = database.collection("BookCollection");
    const BorrowCollection = database.collection("BorrowCollection");
    const ContuctMassage = database.collection("ContactMassage");
    const CarouselCollection = database.collection("CarouselCollection");

    app.get("/", (req, res) => {
      res.send(" CPBI library Management server is coocking.............");
    });

    // ------------------------- USER ROUTES ---------------------------------

    app.post("/register", async (req, res) => {
      try {
        const user = req.body;

        if (!user.email) {
          return res.status(400).send({
            success: false,
            message: "Email required",
          });
        }

        // 1️⃣ Check if user already exists
        const existingUser = await UserCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          return res.status(200).send({
            success: true,
            message: "User already registered",
          });
        }

        // 2️⃣ Insert only if not exists
        const result = await UserCollection.insertOne(user);

        res.status(201).send({
          success: true,
          message: "User registered successfully",
          data: result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    app.get("/me", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;

        const user = await UserCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ success: true, user });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    app.put("/update", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const updateData = req.body;

        const result = await UserCollection.updateOne(
          { email },
          { $set: updateData }
        );

        res.send({ success: true, message: "Profile updated", result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // GET /users?page=1&role=admin&status=active&search=john
    app.get("/users", verifyToken, async (req, res) => {
      try {
        const { page = 1, role, status, search } = req.query;
        const limit = 10; // items per page
        const skip = (page - 1) * limit;

        // Build query object
        const query = {};

        if (role) query.role = role;
        if (status) query.status = status;
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ];
        }

        // Get total count
        const totalUsers = await UserCollection.countDocuments(query);

        // Fetch users with pagination
        const users = await UserCollection.find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        const totalPages = Math.ceil(totalUsers / limit);

        res.send({
          success: true,
          users,
          totalPages,
          page: Number(page),
          totalUsers,
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    // DELETE /users/:id
    app.delete("/users/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;

        // Optional: Prevent admin from deleting themselves
        const requestingUserEmail = req.user.email;
        const requestingUser = await UserCollection.findOne({
          email: requestingUserEmail,
        });
        if (requestingUser.role === "admin") {
          const userToDelete = await UserCollection.findOne({
            _id: new ObjectId(id),
          });
          if (userToDelete.email === requestingUserEmail) {
            return res.status(400).send({
              success: false,
              message: "Admin cannot delete their own account",
            });
          }
        }

        const result = await UserCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        res.send({ success: true, message: "User deleted successfully" });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });
    // PATCH /users/:id/status
    app.patch("/users/:id/status", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;

        // Find the user
        const user = await UserCollection.findOne({ _id: new ObjectId(id) });
        if (!user) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        // Toggle status
        const newStatus = user.status === "active" ? "pending" : "active";

        const result = await UserCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: newStatus } }
        );

        res.send({
          success: true,
          message: `User status updated to ${newStatus}`,
          status: newStatus,
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // books collections

    // GET /books/categories - Get all available book categories
    app.get("/books/categories", async (req, res) => {
      try {
        // Fetch only available books based on 'status'
        const availableBooks = await BookCollection.find({
          status: "available",
        }).toArray();

        if (!Array.isArray(availableBooks)) {
          return res.status(500).send({
            success: false,
            message: "Data format error",
          });
        }

        // Extract unique categories, filter out empty/null
        const categories = [
          ...new Set(
            availableBooks
              .map((book) => book.category)
              .filter((cat) => cat && cat.trim() !== "")
          ),
        ];

        res.status(200).send({
          success: true,
          categories,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    app.post("/books", verifyToken, async (req, res) => {
      try {
        const {
          title,
          coverImage, // renamed from coverPage
          description,
          authors, // now an array of authors
          category,
          language,
          totalCopies,
          shelfNo,
        } = req.body;

        // Validate required fields
        if (
          !title ||
          !authors ||
          !Array.isArray(authors) ||
          authors.length === 0 ||
          !totalCopies
        ) {
          return res.status(400).send({ message: "Required fields missing" });
        }

        const newBook = {
          title,
          coverPage: coverImage, // store under coverPage field in DB
          description,
          author: authors, // store as array
          category,
          language,
          totalCopies: Number(totalCopies),
          availableCopies: Number(totalCopies),
          shelfNo,
          status: Number(totalCopies) > 0 ? "available" : "unavailable",
          createdAt: new Date(),
        };

        await BookCollection.insertOne(newBook);

        res.status(201).send({
          success: true,
          message: "Book added successfully",
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Failed to add book",
        });
      }
    });

    app.get("/books/:id", async (req, res) => {
      try {
        const book = await BookCollection.findOne({
          _id: new ObjectId(req.params.id),
        });

        if (!book) return res.status(404).send({ message: "Book not found" });

        res.send(book);
      } catch {
        res.status(500).send({ message: "Failed to fetch book" });
      }
    });

    app.get("/books", async (req, res) => {
      try {
        const {
          page = 1,
          pageSize = 8,
          search = "",
          category = "",
          availability = "available",
          sort = "",
        } = req.query;

        /* ---------- Pagination ---------- */
        const currentPage = parseInt(page);
        const limit = parseInt(pageSize);
        const skip = (currentPage - 1) * limit;

        /* ---------- Filters ---------- */
        const query = {};

        // 🔍 Search (title or author)
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { author: { $elemMatch: { $regex: search, $options: "i" } } },
          ];
        }

        // 📚 Category
        if (category) {
          query.category = { $regex: `^${category}$`, $options: "i" };
        }

        // ✅ Availability
        if (availability) {
          query.status = { $regex: `^${availability}$`, $options: "i" };
        }

        /* ---------- Sorting ---------- */
        let sortOption = {};
        if (sort === "newest") sortOption = { createdAt: -1 };
        if (sort === "popular") sortOption = { borrowCount: -1 };

        /* ---------- Fetch ---------- */
        const books = await BookCollection.find(query)
          .sort(sortOption)
          .skip(skip)
          .limit(limit)
          .toArray();

        const totalBooks = await BookCollection.countDocuments(query);
        const totalPages = Math.ceil(totalBooks / limit);

        /* ---------- Response ---------- */
        res.status(200).send({
          books,
          totalPages,
        });
      } catch (error) {
        res.status(500).send({
          books: [],
          totalPages: 0,
        });
      }
    });

    app.put("/books/:id", verifyToken, async (req, res) => {
      try {
        const updateData = req.body;

        const result = await BookCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          {
            $set: {
              ...updateData,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0)
          return res.status(404).send({ message: "Book not found" });

        res.send({
          success: true,
          message: "Book updated successfully",
        });
      } catch {
        res.status(500).send({
          success: false,
          message: "Failed to update book",
        });
      }
    });

    app.delete("/books/:id", verifyToken, async (req, res) => {
      try {
        const result = await BookCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });

        if (result.deletedCount === 0)
          return res.status(404).send({ message: "Book not found" });

        res.send({
          success: true,
          message: "Book deleted successfully",
        });
      } catch {
        res.status(500).send({
          success: false,
          message: "Failed to delete book",
        });
      }
    });

    //=========================== borrow and return =========================

// User requests to borrow a book
app.post("/books/borrow/:id", verifyToken, async (req, res) => {
  try {
    const bookId = new ObjectId(req.params.id);
    const userEmail = req.user.email;

    const userDoc = await UserCollection.findOne({ email: userEmail });
    const role = userDoc?.role;

    // Borrow limits
    const borrowLimits = { member: 3, teacher: 14, admin: Infinity };
    const borrowDays = { member: 7, teacher: 15, admin: 30 };

    const maxAllowed = borrowLimits[role] ?? 3;
    const allowedDays = borrowDays[role] ?? 14;

    const activeBorrows = await BorrowCollection.countDocuments({
      userEmail,
      status: "borrowed",
    });

    if (activeBorrows >= maxAllowed) {
      return res.status(403).send({
        success: false,
        message: `Borrow limit reached (${maxAllowed} books)`,
      });
    }

    const book = await BookCollection.findOne({ _id: bookId });
    if (!book || book.availableCopies <= 0) {
      return res.status(400).send({ message: "Book not available" });
    }

    const borrowDate = new Date();
    const returnDate = new Date();
    returnDate.setDate(borrowDate.getDate() + allowedDays);

    // Insert as pending
    await BorrowCollection.insertOne({
      bookId,
      userEmail,
      borrowDate,
      returnDate,
      status: "pending-borrow", // Pending borrow
    });

    res.send({
      success: true,
      message: "Borrow request sent. Waiting for admin confirmation.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Borrow request failed" });
  }
});

// User requests to return a book
app.post("/books/return/:id", verifyToken, async (req, res) => {
  try {
    const bookId = new ObjectId(req.params.id);
    const userEmail = req.user.email;

    const borrowRecord = await BorrowCollection.findOne({
      bookId,
      userEmail,
      status: "borrowed",
    });

    if (!borrowRecord) {
      return res.status(400).send({
        success: false,
        message: "You did not borrow this book",
      });
    }

    // Update status to pending-return
    await BorrowCollection.updateOne(
      { _id: borrowRecord._id },
      { $set: { status: "pending-return", requestDate: new Date() } }
    );

    res.send({
      success: true,
      message: "Return request sent. Waiting for admin confirmation.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Return request failed" });
  }
});
// Get all pending borrow/return requests
app.get("/admin/pending-requests", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const adminDoc = await UserCollection.findOne({ email: userEmail });

    if (!adminDoc || adminDoc.role !== "admin") {
      return res.status(403).send({ message: "Admin access only" });
    }

    const pendingRequests = await BorrowCollection.aggregate([
      { $match: { status: { $in: ["pending-borrow", "pending-return"] } } },
      {
        $lookup: {
          from: "BookCollection",
          localField: "bookId",
          foreignField: "_id",
          as: "book",
        },
      },
      { $unwind: "$book" },
    ]).toArray();

    res.send({ success: true, pendingRequests });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Failed to fetch requests" });
  }
});
app.post("/admin/confirm-borrow/:id", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const adminDoc = await UserCollection.findOne({ email: userEmail });

    if (!adminDoc || adminDoc.role !== "admin") {
      return res.status(403).send({ message: "Admin access only" });
    }

    const borrowId = new ObjectId(req.params.id);
    const borrowRecord = await BorrowCollection.findOne({ _id: borrowId });

    if (!borrowRecord || borrowRecord.status !== "pending-borrow") {
      return res.status(400).send({ message: "Invalid borrow request" });
    }

    const book = await BookCollection.findOne({ _id: borrowRecord.bookId });
    if (!book || book.availableCopies <= 0) {
      return res.status(400).send({ message: "Book not available" });
    }

    const updatedAvailable = book.availableCopies - 1;

    await BookCollection.updateOne(
      { _id: book._id },
      {
        $set: {
          availableCopies: updatedAvailable,
          status: updatedAvailable === 0 ? "unavailable" : "available",
        },
      }
    );

    await BorrowCollection.updateOne(
      { _id: borrowId },
      { $set: { status: "borrowed", borrowConfirmedAt: new Date() } }
    );

    res.send({ success: true, message: "Borrow request confirmed" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Failed to confirm borrow" });
  }
});
app.post("/admin/confirm-return/:id", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const adminDoc = await UserCollection.findOne({ email: userEmail });

    if (!adminDoc || adminDoc.role !== "admin") {
      return res.status(403).send({ message: "Admin access only" });
    }

    const borrowId = new ObjectId(req.params.id);
    const borrowRecord = await BorrowCollection.findOne({ _id: borrowId });

    if (!borrowRecord || borrowRecord.status !== "pending-return") {
      return res.status(400).send({ message: "Invalid return request" });
    }

    const book = await BookCollection.findOne({ _id: borrowRecord.bookId });
    const updatedAvailable = book.availableCopies + 1;

    await BookCollection.updateOne(
      { _id: book._id },
      { $set: { availableCopies: updatedAvailable, status: "available" } }
    );

    await BorrowCollection.updateOne(
      { _id: borrowId },
      { $set: { status: "returned", returnConfirmedAt: new Date() } }
    );

    res.send({ success: true, message: "Return request confirmed" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Failed to confirm return" });
  }
});
app.get("/books/status/:id", verifyToken, async (req, res) => {
  try {
    const bookId = new ObjectId(req.params.id);
    const userEmail = req.user.email;

    // Find borrow record for this user & book
    const borrowRecord = await BorrowCollection.findOne({
      bookId,
      userEmail,
    });

    if (!borrowRecord) {
      return res.send({
        success: true,
        status: "not-borrowed",
        message: "You have not borrowed or requested this book",
      });
    }

    let statusMessage = "";
    switch (borrowRecord.status) {
      case "pending-borrow":
        statusMessage = "Borrow request pending";
        break;
      case "borrowed":
        statusMessage = "Book currently borrowed";
        break;
      case "pending-return":
        statusMessage = "Return request pending";
        break;
      case "returned":
        statusMessage = "Book returned";
        break;
      default:
        statusMessage = borrowRecord.status;
    }

    res.send({
      success: true,
      status: borrowRecord.status,
      message: statusMessage,
      borrowDate: borrowRecord.borrowDate,
      returnDate: borrowRecord.returnDate,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Failed to get book status",
    });
  }
});
// =========================== ADMIN PENDING BORROW/RETURN REQUESTS ===========================

app.get("/admin/borrows/pending", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const adminDoc = await UserCollection.findOne({ email: userEmail });

    if (!adminDoc || adminDoc.role !== "admin") {
      return res.status(403).send({ success: false, message: "Admin access only" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Only fetch pending borrow and pending return
    const pipeline = [
      {
        $match: {
          status: { $in: ["pending-borrow", "pending-return"] }
        }
      },
      {
        $lookup: {
          from: "BookCollection",
          localField: "bookId",
          foreignField: "_id",
          as: "book"
        }
      },
      { $unwind: { path: "$book", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "UserCollection",
          localField: "userEmail",
          foreignField: "email",
          as: "user"
        }
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          status: 1,
          borrowDate: 1,
          returnDate: 1,
          book: { title: 1, author: 1 },
          user: { name: 1, email: 1 }
        }
      },
      { $sort: { borrowDate: -1 } }, // newest requests first
      { $skip: skip },
      { $limit: limit }
    ];

    const data = await BorrowCollection.aggregate(pipeline).toArray();

    const totalPending = await BorrowCollection.countDocuments({
      status: { $in: ["pending-borrow", "pending-return"] }
    });
    const totalPages = Math.ceil(totalPending / limit);

    res.send({
      success: true,
      data,
      pagination: {
        page,
        totalPages,
        totalPending,
        limit
      }
    });
  } catch (error) {
    console.error("Pending Requests Error:", error);
    res.status(500).send({
      success: false,
      message: "Failed to fetch pending requests"
    });
  }
});


    app.get("/my-borrowed-books", verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email;

        const borrowedBooks = await BorrowCollection.aggregate([
          {
            $match: {
              userEmail,
              status: "borrowed",
            },
          },
          {
            $lookup: {
              from: "BookCollection",
              localField: "bookId",
              foreignField: "_id",
              as: "book",
            },
          },
          { $unwind: "$book" },
        ]).toArray();

        res.send(borrowedBooks);
      } catch {
        res.status(500).send({ message: "Failed to fetch borrowed books" });
      }
    });

    app.get("/borrow-history", verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email;

        const history = await BorrowCollection.aggregate([
          { $match: { userEmail } },
          {
            $lookup: {
              from: "BookCollection",
              localField: "bookId",
              foreignField: "_id",
              as: "book",
            },
          },
          { $unwind: "$book" },
          { $sort: { borrowDate: -1 } },
        ]).toArray();

        res.send(history);
      } catch {
        res.status(500).send({ message: "Failed to load history" });
      }
    });

// =========================== ADMIN BORROW HISTORY ===========================

app.get("/admin/borrows", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const adminDoc = await UserCollection.findOne({ email: userEmail });

    // Only allow admins
    if (!adminDoc || adminDoc.role !== "admin") {
      return res.status(403).send({ success: false, message: "Admin access only" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const sortOrder = req.query.order === "desc" ? -1 : 1; // asc = 1, desc = -1
    const skip = (page - 1) * limit;

    // Build sort object (primarily by status, then by borrowDate descending)
    let sort = { status: sortOrder, borrowDate: -1 };

    // Aggregation pipeline to join book and user info
    const pipeline = [
      {
        $lookup: {
          from: "BookCollection",
          localField: "bookId",
          foreignField: "_id",
          as: "book",
        },
      },
      { $unwind: { path: "$book", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "UserCollection",
          localField: "userEmail",
          foreignField: "email",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      // Project only needed fields
      {
        $project: {
          _id: 1,
          status: 1,
          borrowDate: 1,
          returnDate: 1,
          book: {
            title: 1,
            author: 1,
          },
          user: {
            name: 1,
            email: 1,
          },
        },
      },

      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
    ];

    // Run aggregation
    const data = await BorrowCollection.aggregate(pipeline).toArray();

    // Get total count for pagination
    const totalBorrows = await BorrowCollection.countDocuments({});
    const totalPages = Math.ceil(totalBorrows / limit);

    res.send({
      success: true,
      data,
      pagination: {
        page,
        totalPages,
        totalBorrows,
        limit,
      },
    });
  } catch (error) {
    console.error("Admin Borrows History Error:", error);
    res.status(500).send({
      success: false,
      message: "Failed to fetch borrow history",
    });
  }
});
    // =========================== DASHBOARD STATS ===========================

    const getPastDate = (days) => {
      if (days < 1) return new Date(); // safety

      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (days - 1));
      return date;
    };

    // 1. Member Dashboard - Personal borrow history (last 30 days)
    app.get("/dashboard/member", verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        const role = req.user.role || "member";

        if (!["member", "teacher"].includes(role)) {
          return res.status(403).send({ message: "Access denied" });
        }

        const startDate = getPastDate(30); // last 30 days

        const borrowData = await BorrowCollection.aggregate([
          {
            $match: {
              userEmail,
              borrowDate: { $gte: startDate },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$borrowDate" },
              },
              borrowed: { $sum: 1 },
              returned: {
                $sum: {
                  $cond: [{ $eq: ["$status", "returned"] }, 1, 0],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ]).toArray();

        // Fill missing dates with 0
        const labels = [];
        const borrowed = [];
        const returned = [];

        for (
          let d = new Date(startDate);
          d <= new Date();
          d.setDate(d.getDate() + 1)
        ) {
          const dateStr = d.toISOString().slice(0, 10);
          labels.push(dateStr);

          const dayData = borrowData.find((item) => item._id === dateStr) || {
            borrowed: 0,
            returned: 0,
          };
          borrowed.push(dayData.borrowed);
          returned.push(dayData.returned);
        }

        res.send({
          success: true,
          chartData: {
            labels,
            datasets: [
              {
                label: "Books Borrowed",
                data: borrowed,
                borderColor: "rgb(59, 130, 246)",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                tension: 0.3,
              },
              {
                label: "Books Returned",
                data: returned,
                borderColor: "rgb(34, 197, 94)",
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                tension: 0.3,
              },
            ],
          },
          summary: {
            totalBorrowedLast30Days: borrowed.reduce((a, b) => a + b, 0),
            totalReturnedLast30Days: returned.reduce((a, b) => a + b, 0),
          },
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to load member dashboard" });
      }
    });

    app.get("/dashboard/teacher", verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        if (!userEmail)
          return res.status(401).send({ message: "Unauthorized" });

        const userDoc = await UserCollection.findOne({ email: userEmail });
        if (!userDoc || userDoc.role !== "teacher") {
          return res.status(403).send({ message: "Access denied" });
        }

        const today = new Date();
        const startDate15 = getPastDate(15); // Last 15 days including today

        // === Safe parsing of borrowDate (handles string or Date) ===
        const parseDateExpr = {
          $cond: [
            { $eq: [{ $type: "$borrowDate" }, "string"] },
            { $dateFromString: { dateString: "$borrowDate" } },
            "$borrowDate",
          ],
        };

        // Daily borrow counts for last 15 days
        const dailyBorrows = await BorrowCollection.aggregate([
          { $match: { userEmail } },
          {
            $addFields: {
              parsedDate: parseDateExpr,
            },
          },
          { $match: { parsedDate: { $gte: startDate15 } } },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$parsedDate",
                  timezone: "UTC",
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]).toArray();

        // Build last 15 days labels + data
        const labels = [];
        const data = [];
        let current = new Date(startDate15);
        while (current <= today) {
          const dateStr = current.toISOString().slice(0, 10);
          labels.push(dateStr);
          const day = dailyBorrows.find((d) => d._id === dateStr);
          data.push(day ? day.count : 0);
          current.setUTCDate(current.getUTCDate() + 1);
        }

        // Total ever borrowed
        const totalRecordsFound = await BorrowCollection.countDocuments({
          userEmail,
        });

        // Currently borrowed
        const currentlyBorrowed = await BorrowCollection.countDocuments({
          userEmail,
          status: { $ne: "returned" },
        });

        // Total returned
        const totalReturned = await BorrowCollection.countDocuments({
          userEmail,
          status: "returned",
        });

        // Average reading time (in days) for returned books
        let avgReadingDays = 0;
        if (totalReturned > 0) {
          const returnedBooks = await BorrowCollection.find({
            userEmail,
            status: "returned",
            returnDate: { $exists: true },
          }).toArray();

          const totalDays = returnedBooks.reduce((sum, book) => {
            const borrow = new Date(
              typeof book.borrowDate === "string"
                ? book.borrowDate
                : book.borrowDate
            );
            const returnD = new Date(book.returnDate);
            const days = (returnD - borrow) / (1000 * 60 * 60 * 24);
            return sum + days;
          }, 0);

          avgReadingDays = Math.round(totalDays / totalReturned);
        }

        res.send({
          success: true,
          user: { name: userDoc.name || "Teacher", email: userEmail },
          chartData: {
            labels,
            datasets: [
              {
                label: "Books Borrowed",
                data,
                borderColor: "rgb(147, 51, 234)",
                backgroundColor: "rgba(147, 51, 234, 0.1)",
                tension: 0.4,
                fill: true,
              },
            ],
          },
          summary: {
            totalRecordsFound,
            currentlyBorrowed,
            totalReturned,
            avgReadingDays,
          },
        });
      } catch (error) {
        console.error("Teacher Dashboard Error:", error);
        res.status(500).send({ message: "Failed to load dashboard" });
      }
    });
   // 3. Admin Dashboard - Library-wide stats (last 6 months)
app.get("/dashboard/admin", verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    if (!userEmail)
      return res.status(401).send({ message: "Unauthorized" });

    const userDoc = await UserCollection.findOne({ email: userEmail });
    if (!userDoc || userDoc.role !== "admin") {
      return res.status(403).send({ message: "Admin access only" });
    }

    const startDate = getPastDate(180); // last 6 months

    const dailyStats = await BorrowCollection.aggregate([
      {
        $match: { borrowDate: { $gte: startDate } },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$borrowDate" } },
          borrowed: {
            $sum: { $cond: [{ $eq: ["$status", "borrowed"] }, 1, 0] },
          },
          pendingBorrows: {
            $sum: { $cond: [{ $eq: ["$status", "pending-borrow"] }, 1, 0] },
          },
          returned: {
            $sum: { $cond: [{ $eq: ["$status", "returned"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]).toArray();

    // Fill dates for chart
    const labels = [];
    const borrowed = [];
    const returned = [];
    const pendingBorrows = [];

    for (let d = new Date(startDate); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      labels.push(dateStr);

      const day = dailyStats.find((s) => s._id === dateStr) || {
        borrowed: 0,
        pendingBorrows: 0,
        returned: 0,
      };
      borrowed.push(day.borrowed);
      returned.push(day.returned);
      pendingBorrows.push(day.pendingBorrows);
    }

    // Admin summary
    const totalBooks = await BookCollection.countDocuments({});
    const availableBooks = await BookCollection.countDocuments({ status: "available" });

    // Sum of total copies of all books
    const totalCopiesAgg = await BookCollection.aggregate([
      {
        $group: {
          _id: null,
          totalCopies: { $sum: "$availableCopies" },
        },
      },
    ]).toArray();
    const totalCopies = totalCopiesAgg[0]?.totalCopies || 0;

    const activeBorrows = await BorrowCollection.countDocuments({ status: "borrowed" });
    const pendingBorrowRequests = await BorrowCollection.countDocuments({ status: "pending-borrow" });
    const totalBorrowsEver = await BorrowCollection.countDocuments({});

    res.send({
      success: true,
      chartData: {
        labels,
        datasets: [
          {
            label: "Daily Borrows",
            data: borrowed,
            borderColor: "rgb(239, 68, 68)",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
          },
          {
            label: "Daily Returns",
            data: returned,
            borderColor: "rgb(34, 197, 94)",
            backgroundColor: "rgba(34, 197, 94, 0.1)",
          },
          {
            label: "Pending Borrow Requests",
            data: pendingBorrows,
            borderColor: "rgb(249, 202, 36)",
            backgroundColor: "rgba(249, 202, 36, 0.1)",
          },
        ],
      },
      summary: {
        totalBooks,
        availableBooks,
        totalCopies,
        booksOnLoan: totalBooks - availableBooks,
        activeBorrows,           // only status === "borrowed"
        pendingBorrowRequests,   // status === "pending-borrow"
        totalBorrowsEver,
        borrowsLast30Days: borrowed.slice(-30).reduce((a, b) => a + b, 0),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to load admin dashboard" });
  }
});

    // =========================== Contuct us===========================

    app.post("/api/contact", async (req, res) => {
      try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !subject || !message) {
          return res.status(400).json({ message: "All fields are required" });
        }

        const newMessage = {
          name,
          email,
          subject,
          message,
          createdAt: new Date(),
        };

        // Don't close the client here if using a shared connection
        const result = await ContuctMassage.insertOne(newMessage);

        res
          .status(201)
          .json({ message: "Message saved", id: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to save message" });
      }
    });

    app.get("/api/contact", verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        if (!userEmail)
          return res.status(401).send({ message: "Unauthorized" });

        const userDoc = await UserCollection.findOne({ email: userEmail });
        const role = userDoc?.role;
        if (!userDoc || userDoc.role !== "admin") {
          return res.status(403).send({ message: "Access denied" });
        }

        if (role !== "admin") {
          return res.status(403).send({ message: "Admin access only" });
        }
        const messages = await ContuctMassage.find({})
          .sort({ createdAt: -1 }) // latest messages first
          .toArray();

        res.status(200).json(messages);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch messages" });
      }
    });

    app.delete("/api/contact", verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email;
        if (!userEmail)
          return res.status(401).send({ message: "Unauthorized" });

        const userDoc = await UserCollection.findOne({ email: userEmail });
        const role = userDoc?.role;
        if (!userDoc || userDoc.role !== "admin") {
          return res.status(403).send({ message: "Access denied" });
        }

        if (role !== "admin") {
          return res.status(403).send({ message: "Admin access only" });
        }
        const result = await ContuctMassage.deleteMany({});
        res.status(200).json({
          message: `Deleted ${result.deletedCount} messages successfully`,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete messages" });
      }
    });

    // -------------------------- FRONT PAGE BOOKS --------------------------

    // GET /books/featured - 4 latest books
    app.get("/featured", async (req, res) => {
      try {
        const books = await BookCollection.find({ status: "available" })
          .sort({ createdAt: -1 })
          .limit(4)
          .toArray();

        res.status(200).send({ books });
      } catch (err) {
        console.error("Featured Books Error:", err);
        res.status(500).send({ books: [], message: "Failed to fetch book" });
      }
    });

    // GET /books/top-borrowed - top 4 borrowed books
    app.get("/top-borrowed", async (req, res) => {
      try {
        // Aggregate top borrowed books
        const borrowedAgg = await BorrowCollection.aggregate([
          { $match: { status: "borrowed" } },
          { $group: { _id: "$bookId", borrowCount: { $sum: 1 } } },
          { $sort: { borrowCount: -1 } },
          { $limit: 4 },
        ]).toArray();

        // Extract bookIds
        const topBorrowedIds = borrowedAgg.map((b) => b._id);

        // Fetch books from BookCollection
        let topBooks = await BookCollection.find({
          _id: { $in: topBorrowedIds },
        }).toArray();

        // If less than 4, fill with latest books from BookCollection
        if (topBooks.length < 4) {
          const remaining = 4 - topBooks.length;
          const additionalBooks = await BookCollection.find({
            _id: { $nin: topBorrowedIds },
          })
            .sort({ createdAt: -1 })
            .limit(remaining)
            .toArray();
          topBooks = topBooks.concat(additionalBooks);
        }

        res.status(200).send({ success: true, books: topBooks });
      } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, books: [] });
      }
    });

    app.post("/carousel", verifyToken, async (req, res) => {
      try {
        const { img, text } = req.body;

        if (!img || !text) {
          return res.status(400).send({
            success: false,
            message: "Image and text are required",
          });
        }

        const newItem = {
          img,
          text,
          createdAt: new Date(),
        };

        const result = await CarouselCollection.insertOne(newItem);

        res.status(201).send({
          success: true,
          item: { _id: result.insertedId, ...newItem },
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to add carousel item",
        });
      }
    });

    app.get("/carousel", async (req, res) => {
      try {
        const items = await CarouselCollection.find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.send(items);
      } catch (error) {
        res.status(500).send([]);
      }
    });
    app.put("/carousel/:id", verifyToken, async (req, res) => {
      try {
        const { img, text } = req.body;

        const result = await CarouselCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          {
            $set: {
              img,
              text,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Carousel item not found",
          });
        }

        res.send({
          success: true,
          message: "Carousel item updated",
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to update carousel item",
        });
      }
    });

    app.delete("/carousel/:id", verifyToken, async (req, res) => {
      try {
        const result = await CarouselCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Carousel item not found",
          });
        }

        res.send({
          success: true,
          message: "Carousel item deleted",
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to delete carousel item",
        });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`CPBI library Management server is listening on port ${port}`);
});
