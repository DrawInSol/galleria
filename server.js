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
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const bs58 = require('bs58');

// CONFIGURA TU TOKEN
const MINT_ADDRESS = "TU_MINT_ADDRESS"; // cámbialo por el mint real
const MIN_TOKENS_REQUIRED = 10;

app.post("/vote", async (req, res) => {
  const { user_wallet, image_id, signature, vote_value } = req.body;

  if (!user_wallet || !image_id || !signature) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  try {
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    const pubKey = new PublicKey(user_wallet);
    const message = `Votar por la imagen: ${image_id}`;
    const encodedMessage = new TextEncoder().encode(message);
    const signatureBuffer = bs58.decode(signature);

    // Verifica la firma
    const isValid = nacl.sign.detached.verify(
      encodedMessage,
      signatureBuffer,
      pubKey.toBytes()
    );

    if (!isValid) {
      return res.status(401).json({ error: "Firma inválida" });
    }

    // Guardar voto directamente sin verificar tokens
    const result = await pool.query(
      `INSERT INTO votos (user_wallet, image_id, vote_value, created_at)
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [user_wallet, image_id, vote_value || 1]
    );

    res.status(200).json({ message: "✅ Voto guardado", vote: result.rows[0] });

  } catch (err) {
    console.error("❌ Error procesando voto:", err);
    res.status(500).json({ error: "Error al procesar el voto" });
  }
});

const nacl = require("tweetnacl");

// Endpoint para verificar si la wallet es holder
app.post("/api/verify-holder", async (req, res) => {
  const { wallet, message, signature } = req.body;

  if (!wallet || !message || !signature) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  try {
    const pubkey = new PublicKey(wallet);
    const decodedSignature = bs58.decode(signature); // Decodificamos la firma de base58

    // Verificar la firma
    const isValid = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      decodedSignature,
      pubkey.toBytes()
    );

    if (!isValid) {
      return res.status(401).json({ isHolder: false, error: "Firma inválida" });
    }

    // Verificar balance de tokens
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed"); // Cambia a "mainnet-beta" cuando estés listo
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
      mint: new PublicKey(MINT_ADDRESS),
    });

    let isHolder = false;
    for (const { account } of tokenAccounts.value) {
      const amount = account.data.parsed.info.tokenAmount.uiAmount;
      if (amount >= MIN_TOKENS_REQUIRED) {
        isHolder = true;
        break;
      }
    }

    res.json({ isHolder });
  } catch (error) {
    console.error("Error en verificación:", error);
    res.status(500).json({ isHolder: false, error: error.message });
  }
});

// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
