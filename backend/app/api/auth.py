import uuid
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from app.db import db_session
from app.db_models import UserDB
from app.auth.security import hash_password, verify_password, create_token
from fastapi import APIRouter, HTTPException, status, Depends
from app.auth.deps import get_current_user_id

router = APIRouter()

STARTING_CASH = 1_000_000


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str
    cash: float


@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(req: SignupRequest):
    with db_session() as s:
        existing = s.execute(
            select(UserDB).where(UserDB.email == req.email)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(409, "Email already registered")

        user_id = str(uuid.uuid4())
        user = UserDB(
            id=user_id,
            email=req.email,
            password_hash=hash_password(req.password),
            cash=STARTING_CASH,
        )
        s.add(user)
        s.flush()

        return AuthResponse(
            token=create_token(user_id),
            user_id=user_id,
            email=user.email,
            cash=float(user.cash),
        )


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest):
    with db_session() as s:
        user = s.execute(
            select(UserDB).where(UserDB.email == req.email)
        ).scalar_one_or_none()
        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        return AuthResponse(
            token=create_token(user.id),
            user_id=user.id,
            email=user.email,
            cash=float(user.cash),
        )


@router.get("/me", response_model=AuthResponse)
def me(user_id: str = Depends(get_current_user_id)):
    with db_session() as s:
        user = s.get(UserDB, user_id)
        if not user:
            raise HTTPException(404, "User not found")
        return AuthResponse(
            token="",   # not re-issued here; client keeps its existing token
            user_id=user.id,
            email=user.email,
            cash=float(user.cash),
        )