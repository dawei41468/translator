// Live Translator Dashboard

const Dashboard = () => {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center max-w-md">
        <h1 className="mb-4 text-4xl font-bold">Welcome to Dashboard</h1>
        <p className="text-xl mb-8">Your translation dashboard</p>
        <p className="text-sm mb-6">
          Start a real-time translated conversation with someone on another device.
        </p>
        <button className="w-full p-2 bg-blue-500 text-white rounded">
          Start New Conversation
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
