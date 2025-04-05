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

  try {
    // Usar la categoría tal como se pasa (ya debería estar en el formato correcto desde el frontend)
    const result = await cloudinary.uploader.upload(image, {
  folder: "drawsol_gallery",
  tags: [category],
  public_id: `${artName}_${Date.now()}`,
  resource_type: "image",
  context: {
    caption: artName,
    wallet: wallet
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

    if (category && category !== 'all') {
      // No normalizar la categoría, usar tal como se pasa
      const result = await cloudinary.api.resources_by_tag(category, {
        resource_type: "image",
        max_results: 100
      });
      resources = result.resources;
    } else {
      // Si no: cargar todas
      const result = await cloudinary.api.resources({
        type: "upload",
        prefix: "drawsol_gallery",
        resource_type: "image",
        max_results: 100
      });
      resources = result.resources;
    }

    // Mapear los recursos, incluyendo created_at
    const images = resources.map(img => ({
  url: img.secure_url,
  category: img.tags?.[0] || "Uncategorized",
  created_at: img.created_at,
  title: img.context?.custom?.caption || "Untitled",
  wallet: img.context?.custom?.wallet || "Unknown"
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

// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
