import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

let envLoaded = false;

const loadEnvIfNeeded = () => {
	if (envLoaded) return;
	envLoaded = true;
	if (typeof process === "undefined" || !process.env) return;

	const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
	const missing = required.some((key) => !process.env[key]);
	if (!missing) return;

	const envPath = path.resolve(process.cwd(), ".env");
	if (!fs.existsSync(envPath)) return;

	const content = fs.readFileSync(envPath, "utf8");
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const idx = line.indexOf("=");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		let value = line.slice(idx + 1).trim();
		if (
			(value.startsWith("\"") && value.endsWith("\"")) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (key && !(key in process.env)) {
			process.env[key] = value;
		}
	}
};

let cachedTransporter = null;
let cachedFrom = null;

const getSmtpConfig = () => {
	loadEnvIfNeeded();
	const env = typeof process !== "undefined" && process.env ? process.env : import.meta.env;
	return {
		SMTP_HOST: env.SMTP_HOST,
		SMTP_PORT: Number(env.SMTP_PORT ?? 2587),
		SMTP_USER: env.SMTP_USER,
		SMTP_PASS: env.SMTP_PASS,
		SMTP_FROM: env.SMTP_FROM || env.SMTP_USER
	};
};

const getTransporter = () => {
	if (cachedTransporter) return cachedTransporter;
	const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = getSmtpConfig();
	const missing = [];
	if (!SMTP_HOST) missing.push("SMTP_HOST");
	if (!SMTP_USER) missing.push("SMTP_USER");
	if (!SMTP_PASS) missing.push("SMTP_PASS");
	if (!SMTP_FROM) missing.push("SMTP_FROM");
	if (missing.length) {
		throw new Error(`SMTP config missing: ${missing.join(", ")}`);
	}
	cachedTransporter = nodemailer.createTransport({
		host: SMTP_HOST,
		port: SMTP_PORT,
		secure: false,
		requireTLS: true,
		auth: {
			user: SMTP_USER,
			pass: SMTP_PASS
		}
	});
	cachedFrom = SMTP_FROM;
	return cachedTransporter;
};

/**
 * @param {{ to: string; subject: string; html: string; text?: string }} options
 */
export const sendEmail = async ({ to, subject, html, text }) => {
	const transporter = getTransporter();
	const from = cachedFrom || getSmtpConfig().SMTP_FROM;
	try {
		await transporter.verify();
	} catch (error) {
		console.error("SMTP verify failed", error);
		throw new Error("SMTP verify failed");
	}

	try {
		await transporter.sendMail({
			from,
			to,
			subject,
			html,
			text
		});
	} catch (error) {
		console.error("SMTP send failed", error);
		throw new Error("SMTP send failed");
	}
};
