import { Amplify } from "aws-amplify";

const userPoolId = import.meta.env.VITE_USER_POOL_ID as string | undefined;
const userPoolClientId = import.meta.env.VITE_USER_POOL_CLIENT_ID as
  | string
  | undefined;

if (!userPoolId || !userPoolClientId) {
  throw new Error(
    "Cognito is not configured. Run `npm run outputs` in infra/ to create frontend/.env.local.",
  );
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      loginWith: { email: true },
    },
  },
});
