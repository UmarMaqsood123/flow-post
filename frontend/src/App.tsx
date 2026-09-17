import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "react-router";
import AppToaster from "@/components/shared/AppToaster";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { queryClient } from "@/lib/queryClient";
import { router } from "@/routing/router";

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <AppToaster />
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
