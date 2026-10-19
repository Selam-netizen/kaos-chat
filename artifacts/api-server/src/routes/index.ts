import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatStatusRouter from "./chatStatus";
import chatgptRouter from "./chatgpt";
import geminiRouter from "./gemini";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatStatusRouter);
router.use(chatgptRouter);
router.use(geminiRouter);

export default router;
