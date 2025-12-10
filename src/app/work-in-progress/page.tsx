export default function WorkInProgressPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex items-center justify-center px-4">
      <div className="max-w-2xl text-center">
        <div className="mb-8">
          <svg
            className="mx-auto h-24 w-24 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
        </div>

        <h1 className="text-4xl font-serif font-bold text-gray-900 mb-4">
          We're Working on Something Special
        </h1>

        <p className="text-lg text-gray-600 mb-8">
          This page is currently under construction. We're putting the finishing touches on it to make sure everything is perfect for your experience.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-accent hover:bg-accent/90 transition-colors"
          >
            Return to Home
          </a>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Thank you for your patience as we prepare this content.
          </p>
        </div>
      </div>
    </div>
  );
}
