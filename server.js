require("dotenv").config();
const express = require("express");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");

const app = express();
app.use(cors()); // Permitir solicitudes desde tu frontend
app.use(express.json({ limit: "10mb" })); // Permitir payloads grandes para imágenes

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Endpoint para subir imágenes
app.post("/upload", async (req, res) => {
  const { image, category, artName } = req.body;

  try {
    const result = await cloudinary.uploader.upload(image, {
      folder: "drawsol_gallery",
      tags: [category], // Usar la categoría como etiqueta
      public_id: `${artName}_${Date.now()}`, // Nombre único
      resource_type: "image"
    });
    res.json({ url: result.secure_url });
  } catch (error) {
    console.error("❌ Error al subir imagen:", error);
    res.status(500).json({ error: "Error al subir la imagen" });
  }
});

// Endpoint para obtener imágenes de la galería
app.get("/gallery", async (req, res) => {
  const { category } = req.query;

  try {
    let resources;
    if (category && category !== 'all') {
      // Buscar solo por categoría (etiqueta)
      const result = await cloudinary.api.resources_by_tag(category, {
        max_results: 100,
        resource_type: "image"
      });
      resources = result.resources;
    } else {
      // Buscar todo
      const result = await cloudinary.api.resources({
        prefix: "drawsol_gallery",
        max_results: 100,
        resource_type: "image"
      });
      resources = result.resources;
    }

    const images = resources.map(img => ({
      url: img.secure_url,
      category: img.tags[0] || "Uncategorized"
    }));

    res.json(images);
  } catch (error) {
    console.error("❌ Error al obtener galería:", error);
    res.status(500).json({ error: "Error al obtener la galería" });
  }
});


// Endpoint raíz
app.get("/", (req, res) => {
  res.send("🚀 API funcionando correctamente");
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
