import { app } from './app';
import { env } from './config/env';

const port = env.PORT;

app.listen(port, () => {
  console.log(`LockerGo API listening on http://localhost:${port}`);
});
