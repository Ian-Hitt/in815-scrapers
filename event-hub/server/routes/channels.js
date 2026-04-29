import { Router } from "express";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import crypto from "crypto";
import { getChannels, getChannel, updateChannel, addChannelCategory, removeChannelCategory } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "..", "data", "uploads");

const router = Router();

router.get("/", (_req, res) => {
  try {
    res.json(getChannels());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", (req, res) => {
  const channel = getChannel(parseInt(req.params.id));
  if (!channel) return res.status(404).json({ error: "Channel not found" });
  res.json(channel);
});

router.patch("/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const channel = getChannel(id);
    if (!channel) return res.status(404).json({ error: "Channel not found" });
    updateChannel(id, req.body);
    res.json(getChannel(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/categories", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { category_id } = req.body;
    if (!category_id) return res.status(400).json({ error: "category_id required" });
    if (!getChannel(id)) return res.status(404).json({ error: "Channel not found" });
    addChannelCategory(id, parseInt(category_id));
    res.json(getChannel(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id/categories/:categoryId", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!getChannel(id)) return res.status(404).json({ error: "Channel not found" });
    removeChannelCategory(id, parseInt(req.params.categoryId));
    res.json(getChannel(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/avatar", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const channel = getChannel(id);
    if (!channel) return res.status(404).json({ error: "Channel not found" });

    const { dataUrl } = req.body;
    if (!dataUrl) return res.status(400).json({ error: "dataUrl is required" });

    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: "Invalid data URL format" });

    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const buffer = Buffer.from(match[2], "base64");

    if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

    const filename = `channel-${id}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

    const imageUrl = `/api/uploads/${filename}`;
    updateChannel(id, { image_url: imageUrl });
    res.json(getChannel(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
