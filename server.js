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
        "caption": artName, // Cambiado de custom.caption a caption
        "wallet": wallet,   // Cambiado de custom.wallet a wallet
        "category": category
      }
    });

    console.log("✅ Imagen subida a Cloudinary:", {
      url: result.secure_url,
      artName,
      wallet,
      category
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

    // Obtener imágenes de Cloudinary
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

    // Depurar la respuesta completa de Cloudinary
    console.log("📸 Respuesta completa de Cloudinary:", JSON.stringify(resources, null, 2));

    // Obtener los conteos de votos desde la vista votos_count
    const votesResult = await pool.query("SELECT image_id, vote_count FROM votos_count");
    const votesMap = new Map(votesResult.rows.map(row => [row.image_id, row.vote_count]));

    // Mapear los recursos a los datos que necesita el frontend
    const images = resources.map((img) => {
      // Acceder al context directamente (eliminando el prefijo "custom.")
      const caption = img.context?.caption || "Sin título";
      const wallet = img.context?.wallet || "Desconocido";
      const category = img.context?.category || img.tags?.[0] || "Sin categoría";

      return {
        url: img.secure_url,
        category: category,
        created_at: img.created_at,
        artName: caption,
        wallet: wallet,
        votes: votesMap.get(img.secure_url) || 0
      };
    });

    console.log("✅ Datos enviados al frontend:", images);
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

// OBTENER METADATOS DE UNA IMAGEN ESPECÍFICA
app.get("/test-metadata/:publicId", async (req, res) => {
  const { publicId } = req.params;

  try {
    const result = await cloudinary.api.resource(publicId, {
      resource_type: "image",
      context: true
    });

    console.log("✅ Metadatos de la imagen:", JSON.stringify(result, null, 2));
    res.json(result);
  } catch (error) {
    console.error("❌ Error al obtener metadatos:", error);
    res.status(500).json({ error: "Error al obtener metadatos" });
  }
});

// RUTA PARA VOTAR
const { PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require("tweetnacl");

app.post("/vote", async (req, res) => {
  const { user_wallet, image_id, signature, message } = req.body;

  console.log("Solicitud de voto recibida:", { user_wallet, image_id, signature, message });

  if (!user_wallet || !image_id || !signature || !message) {
    console.log("Faltan campos obligatorios:", { user_wallet, image_id, signature, message });
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  try {
    // Verificar la firma
    const pubKey = new PublicKey(user_wallet);
    const signatureBuffer = bs58.decode(signature);
    const encodedMessage = new TextEncoder().encode(message);

    const isValid = nacl.sign.detached.verify(
      encodedMessage,
      signatureBuffer,
      pubKey.toBytes()
    );

    if (!isValid) {
      console.log("Firma inválida:", { message, signature });
      return res.status(401).json({ error: "Firma inválida" });
    }

    // Verificar si el usuario ya ha votado por esta imagen
    const existingVote = await pool.query(
      `SELECT * FROM votos WHERE user_wallet = $1 AND image_id = $2`,
      [user_wallet, image_id]
    );

    if (existingVote.rows.length > 0) {
      console.log("El usuario ya ha votado por esta imagen:", { user_wallet, image_id });
      return res.status(403).json({ error: "Ya has votado por esta imagen" });
    }

    // Registrar el voto
    console.log("Registrando voto en la base de datos...");
    const result = await pool.query(
      `INSERT INTO votos (user_wallet, image_id, created_at)
       VALUES ($1, $2, NOW())
       RETURNING *`,
      [user_wallet, image_id]
    );

    console.log("✅ Voto registrado con éxito:", result.rows[0]);
    res.status(200).json({ message: "✅ Voto registrado", vote: result.rows[0] });
  } catch (err) {
    console.error("❌ Error procesando voto:", err);
    if (err.code === '23505') {
      return res.status(403).json({ error: "Ya has votado por esta imagen" });
    }
    res.status(500).json({ error: `Error al procesar el voto: ${err.message}` });
  }
});

// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
