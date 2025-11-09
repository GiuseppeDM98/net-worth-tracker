# Portfolio Tracker

A comprehensive web application to track and manage your investment portfolio across multiple asset classes.

## Features

- **Multi-Asset Support**: Track stocks, ETFs, bonds, crypto, real estate, cash, and commodities
- **Real-time Price Updates**: Automatic price updates via Yahoo Finance API
- **Asset Allocation Management**: Set target allocations and monitor deviations
- **Portfolio Visualization**: Interactive charts and dashboards
- **Firebase Authentication**: Secure user authentication with email/password and Google OAuth
- **Firestore Database**: Cloud-based data persistence

## Tech Stack

- **Frontend**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Price Data**: yahoo-finance2
- **Charts**: Recharts
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase project ([Create one here](https://console.firebase.google.com/))

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
   - Copy `.env.local.example` to `.env.local`
   - Fill in your Firebase configuration values from Firebase Console

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) to view the app

## Project Structure

```
├── app/                    # Next.js app router pages
│   ├── dashboard/         # Protected dashboard routes
│   ├── login/            # Login page
│   └── register/         # Registration page
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   └── layout/           # Layout components
├── contexts/             # React contexts (Auth)
├── lib/                  # Utility libraries
│   ├── firebase/         # Firebase configuration
│   ├── utils/           # Utility functions
│   └── constants/       # Constants and colors
└── types/               # TypeScript type definitions
```

## Deployment

Deploy to Vercel by connecting your GitHub repository. Don't forget to add environment variables in the Vercel dashboard!
