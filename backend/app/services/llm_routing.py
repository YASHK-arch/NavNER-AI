import json
from groq import AsyncGroq
from app.config import settings

# Initialize Groq client
client = AsyncGroq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY else None

async def generate_alternative_routes(origin_name: str, dest_name: str, commodity: str, blockage_reason: str) -> list[dict]:
    """
    Calls Groq's Qwen model to generate dynamic route alternatives based on trip context.
    """
    if not client:
        # Fallback if no API key is provided
        return [
            {
                "id": "fallback_route",
                "quality": "OPTIMAL",
                "label": "Demo Route (No API Key)",
                "extraTime": 0,
                "distance": 0,
                "hazardScore": 0.0,
                "description": "Please add GROQ_API_KEY to .env to see AI-generated routes.",
            }
        ]

    prompt = f"""
You are an advanced logistics AI routing engine for the NavNER (North East Region) supply chain network in India.
A shipment of {commodity} traveling from {origin_name} to {dest_name} has been blocked due to {blockage_reason}.

Generate exactly 3 alternative routes to reach {dest_name} from {origin_name} bypassing the hazard.
Return the response as a valid JSON array of objects.
Each object MUST have these exact keys:
- "id": string (unique identifier like "route_a")
- "quality": string (must be one of "OPTIMAL", "ALTERNATE", or "LAST_RESORT")
- "label": string (a short, realistic name for the route, e.g., "Via NH-37 Bypass")
- "extraTime": integer (estimated extra delay in minutes. Can be negative if it's faster, but usually positive)
- "distance": integer (total distance in km)
- "hazardScore": float (a value between 0.0 and 1.0 indicating risk, 0 is safe)
- "description": string (a brief 1-2 sentence explanation of the route and its conditions)

Your response must be ONLY a valid JSON array. Do not include markdown formatting or backticks.
"""

    try:
        response = await client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="qwen/qwen3.8-27b",
            temperature=0.7,
            max_tokens=1024,
        )
        
        content = response.choices[0].message.content.strip()
        # Clean up markdown if present
        if content.startswith("```json"):
            content = content[7:-3].strip()
        elif content.startswith("```"):
            content = content[3:-3].strip()
            
        data = json.loads(content)
        
        # If it returned an object with a "routes" key or similar, extract it
        if isinstance(data, dict):
            for val in data.values():
                if isinstance(val, list):
                    return val
            return [data] # Fallback
            
        return data

    except Exception as e:
        print(f"Error generating LLM routes: {e}")
        # Fallback to a safe default on error
        return [
            {
                "id": "error_route",
                "quality": "ALTERNATE",
                "label": "AI Generation Failed",
                "extraTime": 0,
                "distance": 0,
                "hazardScore": 0.0,
                "description": f"Error calling Groq API: {str(e)}",
            }
        ]
