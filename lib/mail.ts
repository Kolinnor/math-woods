import net from "node:net";
import tls from "node:tls";

type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

type SmtpConnection = net.Socket | tls.TLSSocket;

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD ?? "";
  const from = process.env.SMTP_FROM?.trim();
  const secure = (process.env.SMTP_SECURE ?? (port === 465 ? "1" : "0")) !== "0";
  const startTls = (process.env.SMTP_STARTTLS ?? (secure ? "0" : "1")) !== "0";
  const authRequired = (process.env.SMTP_AUTH_REQUIRED ?? "1") !== "0";

  if (!host || !from || (authRequired && (!user || !password))) return null;
  return { host, port, user, password, from, secure, startTls };
}

export function canSendMail() {
  return Boolean(smtpConfig());
}

export async function sendMail(message: MailMessage) {
  const config = smtpConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured.");
    }
    console.warn(`SMTP is not configured. Would send "${message.subject}" to ${message.to}.`);
    return;
  }

  let socket = await connect(config.host, config.port, config.secure);
  try {
    await expect(socket, 220);
    await command(socket, `EHLO ${process.env.APP_DOMAIN || "mathwoods.org"}`, 250);

    if (!config.secure && config.startTls) {
      await command(socket, "STARTTLS", 220);
      socket = await upgradeToTls(socket, config.host);
      await command(socket, `EHLO ${process.env.APP_DOMAIN || "mathwoods.org"}`, 250);
    }

    if (config.user && config.password) {
      await command(socket, "AUTH LOGIN", 334);
      await command(socket, Buffer.from(config.user).toString("base64"), 334);
      await command(socket, Buffer.from(config.password).toString("base64"), 235);
    }

    await command(socket, `MAIL FROM:<${addressOnly(config.from)}>`, 250);
    await command(socket, `RCPT TO:<${addressOnly(message.to)}>`, [250, 251]);
    await command(socket, "DATA", 354);
    await command(socket, formatMessage(config.from, message), 250);
    await command(socket, "QUIT", 221);
  } finally {
    socket.destroy();
  }
}

function connect(host: string, port: number, secure: boolean): Promise<SmtpConnection> {
  return new Promise((resolve, reject) => {
    const socket = secure ? tls.connect({ host, port, servername: host }) : net.createConnection({ host, port });
    const onReady = () => {
      cleanup();
      resolve(socket);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("connect", onReady);
      socket.off("secureConnect", onReady);
      socket.off("error", onError);
    };
    socket.once(secure ? "secureConnect" : "connect", onReady);
    socket.once("error", onError);
    socket.setTimeout(10_000, () => {
      socket.destroy(new Error("SMTP connection timed out."));
    });
  });
}

function upgradeToTls(socket: SmtpConnection, host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: host });
    const onReady = () => {
      cleanup();
      resolve(secureSocket);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      secureSocket.off("secureConnect", onReady);
      secureSocket.off("error", onError);
    };
    secureSocket.once("secureConnect", onReady);
    secureSocket.once("error", onError);
  });
}

async function command(socket: SmtpConnection, line: string, expected: number | number[]) {
  socket.write(`${escapeDataLine(line)}\r\n`);
  await expect(socket, expected);
}

function expect(socket: SmtpConnection, expected: number | number[]) {
  const expectedCodes = Array.isArray(expected) ? expected : [expected];
  return new Promise<void>((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (!last || !/^\d{3} /.test(last)) return;

      cleanup();
      const code = Number(last.slice(0, 3));
      if (expectedCodes.includes(code)) {
        resolve();
      } else {
        reject(new Error(`Unexpected SMTP response ${code}: ${buffer.trim()}`));
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function formatMessage(from: string, message: MailMessage) {
  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit"
  ];
  const body = message.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  return `${headers.join("\r\n")}\r\n\r\n${body}\r\n.`;
}

function addressOnly(value: string) {
  return value.match(/<([^>]+)>/)?.[1] ?? value;
}

function encodeHeader(value: string) {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function escapeDataLine(line: string) {
  return line === "." ? ".." : line;
}
