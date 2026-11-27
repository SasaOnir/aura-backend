export default function handler(req: any, res: any) {
  res.status(200).json({ status: 'ok', ts: Date.now(), test: 'minimal' });
}
