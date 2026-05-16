from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from app.db import db_session
from app.db_models import UserDB
from app.auth.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    with db_session() as s:
        exists = s.execute(
            select(UserDB.id).where(UserDB.id == user_id)
        ).scalar_one_or_none()
    if not exists:
        raise HTTPException(401, "User not found")
    return user_id