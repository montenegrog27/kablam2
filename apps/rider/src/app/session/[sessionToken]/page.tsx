import RiderSessionClient from "./rider-session-client";

type RiderSessionPageProps = {
  params: Promise<{
    sessionToken: string;
  }>;
};

export default async function RiderSessionPage({
  params,
}: RiderSessionPageProps) {
  const { sessionToken } = await params;

  return <RiderSessionClient sessionToken={sessionToken} />;
}
