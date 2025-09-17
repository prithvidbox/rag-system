from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from tortoise.exceptions import IntegrityError

from rag_shared import Settings

from ..db.models import User
from ..dependencies import get_settings_dep
from ..models import TokenResponse, UserCreateRequest, UserLoginRequest, UserResponse
from ..security import create_access_token, get_current_user, get_password_hash, verify_password

router = APIRouter(prefix="/v1/auth", tags=["auth"])


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: UserCreateRequest, settings: Settings = Depends(get_settings_dep)):
    hashed_password = get_password_hash(request.password)
    try:
        user = await User.create(
            email=request.email.lower(),
            hashed_password=hashed_password,
            display_name=request.display_name,
        )
    except IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered") from exc
    return UserResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        created_at=user.created_at,
    )


@router.post("/signin", response_model=TokenResponse)
async def signin(request: UserLoginRequest, settings: Settings = Depends(get_settings_dep)):
    user = await User.get_or_none(email=request.email.lower())
    if user is None or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(data={"sub": str(user.id)}, settings=settings)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        display_name=current_user.display_name,
        created_at=current_user.created_at,
    )
