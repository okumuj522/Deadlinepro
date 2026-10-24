
import { pool } from "./database.js";

async function testDatabase() {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query("SELECT VERSION() AS version, DATABASE() AS databaseName");

    console.log("MySQL connected successfully!");
    console.log(rows);

    connection.release();
  } catch (error) {
    console.error("MySQL connection failed:", error);
  } finally {
    await pool.end();
  }
}

testDatabase();

