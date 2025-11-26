import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
// import { authOptions } from '@/lib/auth'
import Link from "next/link";

export default async function Home() {
  // const session = await getServerSession(authOptions)

  // if (session) {
  //   redirect('/dashboard')
  // }

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-4">AI Wardrobe</h1>
        <p className="text-xl text-gray-600 mb-8">
          Upload your wardrobe and get AI-powered outfit recommendations for any
          occasion
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="px-6 py-3 bg-white text-purple-600 border-2 border-purple-600 rounded-lg hover:bg-purple-50 transition-colors"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
