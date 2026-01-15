import type { APIRoute } from "astro";
import { sendEmail } from "../../../server/lib/email.js";

export const GET: APIRoute = async () => {
	try {
		const env = import.meta.env ?? process.env;
		const to = (env.SMTP_TEST_TO || env.SMTP_USER || "").toString();
		if (!to) {
			return new Response("Missing SMTP_TEST_TO or SMTP_USER", { status: 500 });
		}

		await sendEmail({
			to,
			subject: "Test email OK",
			html: "<p>Email test Resend OK.</p>"
		});

		console.log("Test email OK");
		return new Response("OK", { status: 200 });
	} catch (error) {
		console.error("Test email failed", error);
		return new Response("ERROR", { status: 500 });
	}
};
