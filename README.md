# AI Wardrobe

AI Wardrobe is a smart outfit recommendation system that uses AI to help you choose what to wear from your personal wardrobe. Upload images of your clothing items, and get intelligent recommendations based on events, occasions, weather, and your preferences.

## Features

- **Wardrobe Management**: Upload and organize your clothing items with metadata (category, style, season, colors, tags)
- **AI-Powered Recommendations**: Get outfit suggestions based on natural language queries
- **Vector Search**: Uses Milvus vector database for semantic similarity matching
- **User Authentication**: Secure user accounts with NextAuth
- **Responsive UI**: Beautiful, mobile-friendly interface built with Next.js and Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 16, React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Supabase), Firebase (Images)
- **Vector Database**: PG Vector
- **Embeddings**: CLIP (via @xenova/transformers)
- **Authentication**: NextAuth.js

## Architecture

### Data Flow

1. **Image Upload**:

   - User uploads clothing image → Backend stores image → CLIP generates embedding → Stored in PG vector + metadata in PostgreSQL

2. **Recommendation**:
   - User enters natural language query → Text embedding generated → Vector similarity search in PG vector → Results filtered by metadata → Recommendations returned

### Database Schema

- **User**: User accounts and authentication
- **WardrobeItem**: Clothing items with metadata (category, style, season, colors, tags)
- **UserPreferences**: User style preferences and settings

### Milvus Collection

- **Collection Name**: `wardrobe_embeddings`
- **Vector Dimension**: 512 (CLIP base model)
- **Fields**: id, user_id, item_id, category, style, season, embedding
- **Index**: HNSW for efficient similarity search

## Setup Instructions

### Prerequisites

- Node.js 20+
- Docker and Docker Compose (for full stack)
- PostgreSQL (if running locally without Docker)
- Milvus (if running locally without Docker)

### Option 1: Docker Compose (Recommended)

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd ai-wardrobe-2
   ```

2. **Create environment file**:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and update:

   - `NEXTAUTH_SECRET`: Generate a random secret (e.g., `openssl rand -base64 32`)
   - `POSTGRES_PASSWORD`: Set a secure password
   - Other environment variables as needed

3. **Start services**:

   ```bash
   docker-compose up -d
   ```

4. **Run database migrations**:

   ```bash
   docker-compose exec app npx prisma migrate dev
   ```

5. **Access the application**:
   - Frontend: http://localhost:3000
   - PostgreSQL: localhost:5432
   - Milvus: localhost:19530

### Option 2: Local Development

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Set up PostgreSQL**:

   - Install and start PostgreSQL
   - Create a database: `createdb ai_wardrobe`

3. **Set up Milvus**:

   - Install Milvus (see [Milvus Installation Guide](https://milvus.io/docs/install_standalone-docker.md))
   - Or use Docker: `docker run -d -p 19530:19530 milvusdb/milvus:latest`

4. **Configure environment**:

   ```bash
   cp .env.example .env
   ```

   Update `.env` with your database and Milvus connection details.

5. **Run database migrations**:

   ```bash
   npx prisma migrate dev
   ```

6. **Initialize Milvus collection**:
   The collection will be automatically created on first use, or you can create it manually using the Milvus client.

7. **Start development server**:

   ```bash
   npm run dev
   ```

8. **Access the application**:
   - http://localhost:3000

## Usage

### 1. Create an Account

- Navigate to the registration page
- Enter your email and password
- Log in with your credentials

### 2. Upload Wardrobe Items

- Go to the "Upload" tab
- Select an image of a clothing item
- Fill in metadata:
  - Category (shirt, pants, dress, etc.)
  - Style (formal, casual, etc.)
  - Season (summer, winter, etc.)
  - Colors and tags (optional)
- Click "Upload Item"

### 3. Browse Your Wardrobe

- Go to the "My Wardrobe" tab
- View all uploaded items
- Filter by category, style, or season

### 4. Get Recommendations

- Go to the "Get Recommendations" tab
- Type a natural language query, for example:
  - "I'm going to a summer evening rooftop party"
  - "I have a formal meeting tomorrow"
  - "Casual beach BBQ this weekend"
- Review the AI-generated recommendations with explanations

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/[...nextauth]` - NextAuth endpoints

### Wardrobe

- `POST /api/wardrobe/upload` - Upload wardrobe item
- `GET /api/wardrobe/items` - Get wardrobe items (with filters)
- `POST /api/wardrobe/recommend` - Get outfit recommendations

## Project Structure

```
ai-wardrobe-2/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── dashboard/        # Dashboard page
│   ├── login/            # Login page
│   ├── register/         # Registration page
│   └── layout.tsx        # Root layout
├── components/            # React components
│   ├── ChatInterface.tsx
│   ├── DashboardClient.tsx
│   ├── WardrobeGallery.tsx
│   └── WardrobeUpload.tsx
├── lib/                   # Utility libraries
│   ├── auth.ts           # NextAuth configuration
│   ├── embeddings.ts     # CLIP embedding functions
│   ├── milvus.ts         # Milvus client and initialization
│   └── prisma.ts         # Prisma client
├── prisma/               # Prisma schema and migrations
│   └── schema.prisma
├── types/                # TypeScript type definitions
├── docker-compose.yml    # Docker Compose configuration
├── Dockerfile           # Docker image configuration
└── README.md            # This file
```

## Embedding Model

The application uses **CLIP (Contrastive Language-Image Pre-training)** via the `@xenova/transformers` library:

- **Model**: `Xenova/clip-vit-base-patch32`
- **Vector Dimension**: 512
- **Use Case**: Both image and text embeddings in the same embedding space for multimodal matching

### Why CLIP?

- CLIP provides aligned embeddings for both images and text
- No need for separate embedding models or cross-modal mapping
- Good performance for fashion/clothing domain
- Open-source and free to use

## Milvus Configuration

### Collection Schema

```javascript
{
  id: VarChar (primary key),
  user_id: VarChar,
  item_id: VarChar,
  category: VarChar,
  style: VarChar,
  season: VarChar,
  embedding: FloatVector (512 dimensions)
}
```

### Index Configuration

- **Type**: HNSW (Hierarchical Navigable Small World)
- **Metric**: L2 (Euclidean distance)
- **Parameters**: M=16, efConstruction=200

## Development

### Running Tests

```bash
npm test
```

### Database Migrations

```bash
# Create a new migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate
```

### Building for Production

```bash
npm run build
npm start
```

## Troubleshooting

### Milvus Connection Issues

- Ensure Milvus is running: `docker ps | grep milvus`
- Check Milvus logs: `docker logs ai-wardrobe-milvus`
- Verify connection string in `.env`

### Embedding Generation Errors

- First-time model loading may take time (models are downloaded)
- Check network connection (models are downloaded from HuggingFace)
- Ensure sufficient memory (CLIP models require ~500MB RAM)

### Database Connection Issues

- Verify PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Run migrations: `npx prisma migrate dev`

## Future Enhancements

- [ ] Outfit combination logic (recommend complete outfits)
- [ ] "Worn recently" tracking to avoid repeat recommendations
- [ ] Weather API integration for automatic weather-based suggestions
- [ ] User preference learning
- [ ] Mobile app (React Native)
- [ ] Social features (share outfits, follow others)
- [ ] E-commerce integration (suggest similar items to buy)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub.

---

Built with ❤️ using Next.js, Milvus, and CLIP
