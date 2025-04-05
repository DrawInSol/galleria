require("dotenv").config();
const express = require("express");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");

const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // importante para Railway
});


const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// SUBIR IMAGEN
app.post("/upload", async (req, res) => {
  const { image, category, artName, wallet } = req.body;

  try {
    const result = await cloudinary.uploader.upload(image, {
      folder: "drawsol_gallery",
      tags: [category],
      public_id: `${artName}_${Date.now()}`,
      resource_type: "image",
      context: { caption: artName, wallet }
    });

    // 🔸 Insertar en PostgreSQL
    await db.query(
      "INSERT INTO imagenes (url, category, art_name, wallet) VALUES ($1, $2, $3, $4)",
      [result.secure_url, category, artName, wallet]
    );

    res.json({ url: result.secure_url });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: "No se pudo subir" });
  }
});


// OBTENER GALERÍA (filtrada o no)
app.get("/gallery", async (req, res) => {
  const { category } = req.query;

  try {
    let query = "SELECT * FROM imagenes";
    let values = [];

    if (category && category !== "all") {
      query += " WHERE category = $1 ORDER BY created_at DESC";
      values.push(category);
    } else {
      query += " ORDER BY created_at DESC";
    }

    const result = await db.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error al obtener galería:", error);
    res.status(500).json({ error: "Error al obtener la galería" });
  }
});

    res.json(images);
  } catch (error) {
    console.error("❌ Error al obtener galería:", error);
    res.status(500).json({ error: "Error al obtener la galería" });
  }
});

// TEST
app.get("/", (req, res) => {
  res.send("🚀 API funcionando correctamente");
});

// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
