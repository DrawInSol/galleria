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

// Conexión a PostgreSQL (Supabase)
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Verificar conexión a la base de datos
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Error conectando a la base de datos:", err.stack);
    return;
  }
  console.log("✅ Conectado a la base de datos de Supabase");
  release();
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
      tags: [category],
      public_id: `${artName}_${Date.now()}`,
      resource_type: "image",
      context: {
        "custom.caption": artName,
        "custom.wallet": wallet
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
        tags: true,
        context: true
      });
      resources = result.resources;
    } else {
      const result = await cloudinary.api.resources({
        type: "upload",
        prefix: "drawsol_gallery",
        resource_type: "image",
        max_results: 100,
        tags: true,
        context: true
      });
      resources = result.resources;
    }

    // Obtener los conteos de votos desde la base de datos
    const votesResult = await pool.query("SELECT image_id, vote_value FROM votos");
    const votesMap = new Map(votesResult.rows.map(row => [row.image_id, row.vote_value]));

    const images = resources.map((img) => ({
      url: img.secure_url,
      category: img.tags?.[0] || "Uncategorized",
      created_at: img.created_at,
      artName: img.context?.custom?.caption || "Untitled",
      wallet: img.context?.custom?.wallet || "Unknown",
      votes: votesMap.get(img.secure_url) || 0 // Añadir el conteo de votos
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

// Ruta para guardar un voto
const { PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require("tweetnacl");

app.post("/vote", async (req, res) => {
  const { user_wallet, image_id, signature, message } = req.body;

  console.log("Solicitud recibida:", { user_wallet, image_id, signature, message });

  if (!user_wallet || !image_id || !signature || !message) {
    console.log("Faltan campos obligatorios:", { user_wallet, image_id, signature, message });
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  try {
    // Verificar la firma
    const pubKey = new PublicKey(user_wallet);
    console.log("Decodificando firma...");
    const signatureBuffer = bs58.decode(signature);
    const encodedMessage = new TextEncoder().encode(message);

    console.log("Verificando firma...");
    const isValid = nacl.sign.detached.verify(
      encodedMessage,
      signatureBuffer,
      pubKey.toBytes()
    );

    if (!isValid) {
      console.log("Firma inválida:", { message, signature });
      return res.status(401).json({ error: "Firma inválida" });
    }

    // Insertar o actualizar el voto usando UPSERT
    console.log("Registrando o actualizando voto en la base de datos...");
    const result = await pool.query(
      `INSERT INTO votos (image_id, vote_value)
       VALUES ($1, 1)
       ON CONFLICT (image_id)
       DO UPDATE SET vote_value = votos.vote_value + 1
       RETURNING *`,
      [image_id]
    );

    console.log("Voto registrado con éxito:", result.rows[0]);
    res.status(200).json({ message: "✅ Voto registrado", vote: result.rows[0] });
  } catch (err) {
    console.error("❌ Error procesando voto:", err);
    res.status(500).json({ error: `Error al procesar el voto: ${err.message}` });
  }
});

// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
