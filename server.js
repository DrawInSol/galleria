require("dotenv").config();
const express = require("express");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");

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

  if (!image || !category || !artName || !wallet) {
    return res.status(400).json({ error: "Faltan campos requeridos" });
  }

  try {
    const result = await cloudinary.uploader.upload(image, {
      folder: "drawsol_gallery",
      tags: [category], // Categoría como tag
      public_id: `${artName}_${Date.now()}`,
      resource_type: "image",
      context: {
        "custom.caption": artName, // Usamos el formato correcto para Cloudinary
        "custom.wallet": wallet    // Aseguramos que wallet se suba al context
      }
    });

    res.json({ url: result.secure_url });
  } catch (error) {
    console.error("❌ Error al subir imagen:", error);
    res.status(500).json({ error: "Error al subir la imagen" });
  }
});

// OBTENER GALERÍA (filtrada o no)
app.get("/gallery", async (req, res) => {
  const { category } = req.query;

  try {
    let resources;

    if (category && category !== "all") {
      const result = await cloudinary.api.resources_by_tag(category, {
        resource_type: "image",
        max_results: 100,
        tags: true // Aseguramos que los tags se incluyan en la respuesta
      });
      resources = result.resources;
    } else {
      const result = await cloudinary.api.resources({
        type: "upload",
        prefix: "drawsol_gallery",
        resource_type: "image",
        max_results: 100,
        tags: true
      });
      resources = result.resources;
    }

    const images = resources.map((img) => ({
      url: img.secure_url,
      category: img.tags?.[0] || "Uncategorized", // Tomamos el primer tag como categoría
      created_at: img.created_at
    }));

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

const { Pool } = require('pg');

// Conexión a PostgreSQL desde Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Ruta para guardar un voto
app.post("/vote", async (req, res) => {
  const { user_wallet, image_id, vote_value } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO "Votos" (user_wallet, image_id, vote_value)
       VALUES ($1, $2, $3) RETURNING *`,
      [user_wallet, image_id, vote_value || 1]
    );

    res.status(200).json({ message: "Voto guardado", vote: result.rows[0] });
  } catch (error) {
    console.error("❌ Error al guardar voto:", error);
    res.status(500).json({ error: "Error al guardar el voto" });
  }
});


// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
