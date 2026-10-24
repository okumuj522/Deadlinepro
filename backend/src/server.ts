
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./database.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const priorities = ["Low", "Medium", "High"] as const;

app.use(cors());
app.use(express.json());

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validTaskDetails(body: Record<string, unknown>) {
  const { title, category, dueDate, priority } = body;

  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 200
  ) {
    return "Title must contain between 1 and 200 characters.";
  }

  if (!validDate(dueDate)) {
    return "Enter a valid deadline in YYYY-MM-DD format.";
  }

  if (
    priority !== undefined &&
    !(priorities as readonly unknown[]).includes(priority)
  ) {
    return "Priority must be Low, Medium, or High.";
  }

  if (
    category !== undefined &&
    (typeof category !== "string" || category.trim().length > 100)
  ) {
    return "Category must be 100 characters or fewer.";
  }

  return null;
}

function taskValues(body: Record<string, unknown>) {
  return {
    title: (body.title as string).trim(),
    category:
      typeof body.category === "string" && body.category.trim()
        ? body.category.trim()
        : "General",
    dueDate: body.dueDate as string,
    priority: (body.priority ?? "Medium") as string,
  };
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "success",
    message: "DeadlinePro API is running",
  });
});

// Get all tasks
app.get("/api/tasks", async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        id,
        title,
        category,
        DATE_FORMAT(due_date, '%Y-%m-%d') AS dueDate,
        priority,
        completed,
        created_at AS createdAt
      FROM tasks
      ORDER BY due_date ASC, id DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error("Failed to retrieve tasks:", error);
    res.status(500).json({ message: "Could not retrieve tasks." });
  }
});

// Create a task
app.post("/api/tasks", async (req, res) => {
  try {
    const error = validTaskDetails(req.body);

    if (error) {
      res.status(400).json({ message: error });
      return;
    }

    const task = taskValues(req.body);

    const [result] = await pool.execute(
      `INSERT INTO tasks (title, category, due_date, priority)
       VALUES (?, ?, ?, ?)`,
      [task.title, task.category, task.dueDate, task.priority],
    );

    const insertResult = result as { insertId: number };

    res.status(201).json({
      id: insertResult.insertId,
      ...task,
      completed: false,
      message: "Task created successfully.",
    });
  } catch (error) {
    console.error("Failed to create task:", error);
    res.status(500).json({ message: "Could not create task." });
  }
});

// Edit a task
app.put("/api/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: "Invalid task ID." });
      return;
    }

    const error = validTaskDetails(req.body);

    if (error) {
      res.status(400).json({ message: error });
      return;
    }

    const task = taskValues(req.body);

    const [result] = await pool.execute(
      `UPDATE tasks
       SET title = ?, category = ?, due_date = ?, priority = ?
       WHERE id = ?`,
      [task.title, task.category, task.dueDate, task.priority, id],
    );

    const updateResult = result as { affectedRows: number };

    if (updateResult.affectedRows === 0) {
      const [rows] = await pool.execute(
        "SELECT id FROM tasks WHERE id = ?",
        [id],
      );

      if ((rows as unknown[]).length === 0) {
        res.status(404).json({ message: "Task not found." });
        return;
      }
    }

    res.json({
      id,
      ...task,
      message: "Task updated successfully.",
    });
  } catch (error) {
    console.error("Failed to update task:", error);
    res.status(500).json({ message: "Could not update task." });
  }
});

// Mark a task as completed or pending
app.patch("/api/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { completed } = req.body;

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: "Invalid task ID." });
      return;
    }

    if (typeof completed !== "boolean") {
      res.status(400).json({
        message: "Completed must be true or false.",
      });
      return;
    }

    const [result] = await pool.execute(
      "UPDATE tasks SET completed = ? WHERE id = ?",
      [completed, id],
    );

    const updateResult = result as { affectedRows: number };

    if (updateResult.affectedRows === 0) {
      const [rows] = await pool.execute(
        "SELECT id FROM tasks WHERE id = ?",
        [id],
      );

      if ((rows as unknown[]).length === 0) {
        res.status(404).json({ message: "Task not found." });
        return;
      }
    }

    res.json({
      id,
      completed,
      message: "Task status updated successfully.",
    });
  } catch (error) {
    console.error("Failed to update task status:", error);
    res.status(500).json({ message: "Could not update task status." });
  }
});

// Delete a task
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: "Invalid task ID." });
      return;
    }

    const [result] = await pool.execute(
      "DELETE FROM tasks WHERE id = ?",
      [id],
    );

    const deleteResult = result as { affectedRows: number };

    if (deleteResult.affectedRows === 0) {
      res.status(404).json({ message: "Task not found." });
      return;
    }

    res.json({
      id,
      message: "Task deleted successfully.",
    });
  } catch (error) {
    console.error("Failed to delete task:", error);
    res.status(500).json({ message: "Could not delete task." });
  }
});

app.listen(PORT, () => {
  console.log(`DeadlinePro API running at http://localhost:${PORT}`);
});
