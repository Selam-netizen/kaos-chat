import { GetChatProviderStatusResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { getChatProviderStatus } from "../providers";

const router: IRouter = Router();

router.get("/chat-status", (_req, res) => {
  res.json(GetChatProviderStatusResponse.parse(getChatProviderStatus()));
});

export default router;
