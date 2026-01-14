import nodemailer from "nodemailer";

const SMTP_HOST = import.meta.env.SMTP_HOST as string | undefined;
const SMTP_PORT = Number(import.meta.env.SMTP_PORT ?? 587);
const SMTP_USER = import.meta.env.SMTP_USER as string | undefined;
const SMTP_PASS = import.meta.env.SMTP_PASS as string | undefined;

const getTransporter = () => {
	if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
		throw new Error("SMTP config missing");
	}
	return nodemailer.createTransport({
		host: SMTP_HOST,
		port: SMTP_PORT,
		secure: false,
		auth: {
			user: SMTP_USER,
			pass: SMTP_PASS
		}
	});
};

type MailOptions = {
	to: string;
	subject: string;
	html: string;
	text?: string;
};

export const sendMail = async ({ to, subject, html, text }: MailOptions) => {
	const transporter = getTransporter();
	await transporter.sendMail({
		from: SMTP_USER,
		to,
		subject,
		html,
		text
	});
};
